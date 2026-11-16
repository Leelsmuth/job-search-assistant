/**
 * Saving a spreadsheet import for a signed-in user.
 *
 * Call importApplicationsDb inside withUserDb: it relies on that transaction,
 * so an import is all or nothing. Any error rolls back every row.
 *
 * - Imports for one user run one at a time (a transaction-scoped advisory
 *   lock), so two tabs cannot both add the same rows.
 * - A request id already recorded in the history is not applied again, so a
 *   retry after a dropped connection cannot import twice.
 * - Duplicates and update targets are worked out here, from the database,
 *   never taken from the request.
 * - Rows are written in bulk, so a 500-row import is a few dozen statements.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { applicationEvents, applications, companies, jobSources, jobs } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { classifyLocationEligibility } from "@/modules/location/eligibility";
import { hashJobDescription } from "@/modules/ingestion/description-hash";
import { IMPORTED_JOB_PIPELINE_STATUS } from "@/modules/jobs/imported-jobs";
import { safeHttpUrl } from "./tracker";
import { findImportDuplicates, planImport, summarizePlan, type ImportValues } from "./tracker-csv";
import {
  planTrackedUpdate,
  requestRowResults,
  type ImportCandidate,
  type ImportRequest,
  type ImportResult,
} from "./tracker-import";

export const IMPORTED_JOB_DESCRIPTION = "Imported from a spreadsheet into the application tracker.";

/** Rows per INSERT. Keeps each statement small and well under Postgres' parameter limit. */
const INSERT_CHUNK = 100;

/** First key of the advisory lock, so it cannot collide with other lock users. */
const IMPORT_LOCK_NAMESPACE = 7301;

/** Job pipeline statuses of jobs the user entered themselves, whose details an import may change. */
const USER_ENTERED_JOBS = new Set(["manual", IMPORTED_JOB_PIPELINE_STATUS]);

function chunks<T>(items: readonly T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** Calendar dates are stored at UTC noon, like everywhere else in the tracker. */
function calendarNoon(date: string | null): Date | null {
  return date ? new Date(`${date}T12:00:00.000Z`) : null;
}

function toIso(value: Date | null): string | null {
  return value && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

export type StoredImportCandidate = ImportCandidate & { jobId: string };

/** The user's tracked applications, oldest first, in the shape duplicate matching needs. */
export async function listImportCandidates(db: Db, userId: string): Promise<StoredImportCandidate[]> {
  const rows = await db.query.applications.findMany({
    where: eq(applications.userId, userId),
    orderBy: [asc(applications.createdAt), asc(applications.id)],
    columns: { id: true, jobId: true, status: true, notes: true, dateApplied: true, followUpDate: true },
    with: {
      job: {
        columns: {
          userId: true,
          title: true,
          jobUrl: true,
          location: true,
          workplaceType: true,
          matchPipelineStatus: true,
        },
        with: { company: { columns: { name: true } } },
      },
    },
  });
  return rows.flatMap((row) => {
    const job = row.job;
    if (!job || job.userId !== userId) return [];
    return [
      {
        id: row.id,
        jobId: row.jobId,
        companyName: job.company?.name ?? "Unknown company",
        title: job.title,
        jobUrl: safeHttpUrl(job.jobUrl),
        status: row.status,
        dateApplied: toIso(row.dateApplied),
        followUpDate: toIso(row.followUpDate),
        notes: row.notes,
        location: job.location,
        workplaceType: job.workplaceType,
        jobDetailsEditable: USER_ENTERED_JOBS.has(job.matchPipelineStatus ?? ""),
      },
    ];
  });
}

async function alreadyImported(db: Db, userId: string, importId: string): Promise<boolean> {
  const [seen] = await db
    .select({ id: applicationEvents.id })
    .from(applicationEvents)
    .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
    .where(
      and(
        eq(applications.userId, userId),
        sql`${applicationEvents.payload}->>'kind' = 'spreadsheet_import'`,
        sql`${applicationEvents.payload}->>'importId' = ${importId}`
      )
    )
    .limit(1);
  return Boolean(seen);
}

/** Company ids by lower-cased name, creating the companies that do not exist yet. */
async function companyIds(db: Db, names: readonly string[]): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  const wanted = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (!wanted.has(key)) wanted.set(key, name);
  }
  if (wanted.size === 0) return byKey;

  // Same rule as manual entry: companies are shared and matched without regard to case.
  for (const keys of chunks([...wanted.keys()], 500)) {
    const found = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(inArray(sql`lower(${companies.name})`, keys))
      .orderBy(asc(companies.createdAt), asc(companies.id));
    for (const company of found) {
      const key = company.name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, company.id);
    }
  }

  const missing = [...wanted].filter(([key]) => !byKey.has(key));
  for (const batch of chunks(missing)) {
    const created = await db
      .insert(companies)
      .values(batch.map(([, name]) => ({ name })))
      .returning({ id: companies.id, name: companies.name });
    for (const company of created) byKey.set(company.name.toLowerCase(), company.id);
  }
  return byKey;
}

function eventPayload(
  request: ImportRequest,
  rowNumber: number,
  action: "add" | "update",
  changes?: Array<{ field: string; label: string; before: string; after: string }>
) {
  return {
    kind: "spreadsheet_import" as const,
    importId: request.importId,
    action,
    fileName: request.fileName,
    rowNumber,
    ...(changes ? { changes } : {}),
  };
}

type NewRow = { rowNumber: number; values: ImportValues };

async function addApplications(db: Db, userId: string, request: ImportRequest, rows: NewRow[], now: Date) {
  if (rows.length === 0) return;

  // A row whose link is a job the user already has but does not track (say, from the
  // feed) becomes that job's application, instead of a second copy of the job.
  const urls = [...new Set(rows.flatMap((row) => (row.values.jobUrl ? [row.values.jobUrl] : [])))];
  const untrackedByUrl = new Map<string, string>();
  for (const batch of chunks(urls, 500)) {
    const found = await db
      .select({ id: jobs.id, jobUrl: jobs.jobUrl })
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, userId),
          inArray(jobs.jobUrl, batch),
          sql`NOT EXISTS (SELECT 1 FROM ${applications} WHERE ${applications.jobId} = ${jobs.id})`
        )
      )
      .orderBy(asc(jobs.createdAt), asc(jobs.id));
    for (const job of found) {
      if (job.jobUrl && !untrackedByUrl.has(job.jobUrl)) untrackedByUrl.set(job.jobUrl, job.id);
    }
  }

  const attached: Array<{ row: NewRow; jobId: string }> = [];
  const created: NewRow[] = [];
  for (const row of rows) {
    const url = row.values.jobUrl;
    const jobId = url ? untrackedByUrl.get(url) : undefined;
    if (jobId) {
      attached.push({ row, jobId });
      // Each job takes one application; a second row with the link gets its own job.
      untrackedByUrl.delete(url!);
    } else {
      created.push(row);
    }
  }

  const companyByName = await companyIds(
    db,
    created.map((row) => row.values.company)
  );

  const newJobs = created.map((row) => {
    const values = row.values;
    const eligibility = classifyLocationEligibility({
      location: values.location,
      workplaceType: values.workplaceType,
      description: IMPORTED_JOB_DESCRIPTION,
    });
    return {
      row,
      sourceId: randomUUID(),
      jobId: randomUUID(),
      companyId: companyByName.get(values.company.toLowerCase()) ?? null,
      eligibility,
    };
  });

  for (const batch of chunks(newJobs)) {
    await db.insert(jobSources).values(
      batch.map((job) => ({
        id: job.sourceId,
        provider: "manual" as const,
        sourceUrl: job.row.values.jobUrl,
        rawPayload: { origin: "spreadsheet_import", importId: request.importId },
      }))
    );
    await db.insert(jobs).values(
      batch.map((job) => ({
        id: job.jobId,
        userId,
        companyId: job.companyId,
        sourceId: job.sourceId,
        title: job.row.values.title,
        location: job.row.values.location,
        workplaceType: job.row.values.workplaceType,
        jobUrl: job.row.values.jobUrl,
        description: IMPORTED_JOB_DESCRIPTION,
        descriptionHash: hashJobDescription(IMPORTED_JOB_DESCRIPTION),
        status: "active",
        isSaved: true,
        matchPipelineStatus: IMPORTED_JOB_PIPELINE_STATUS,
        dateDiscovered: now,
        locationEligibility: job.eligibility.class,
        locationFlags: job.eligibility.flags,
      }))
    );
  }

  if (attached.length > 0) {
    await db
      .update(jobs)
      .set({ isSaved: true, updatedAt: now })
      .where(and(eq(jobs.userId, userId), inArray(jobs.id, attached.map((item) => item.jobId))));
  }

  const newApplications = [
    ...newJobs.map((job) => ({ row: job.row, jobId: job.jobId })),
    ...attached.map((item) => ({ row: item.row, jobId: item.jobId })),
  ].map((item) => ({ ...item, applicationId: randomUUID() }));

  for (const batch of chunks(newApplications)) {
    await db.insert(applications).values(
      batch.map((item) => ({
        id: item.applicationId,
        userId,
        jobId: item.jobId,
        status: item.row.values.status,
        dateSaved: now,
        // Only the dates the file gave: an import never invents an applied date.
        dateApplied: calendarNoon(item.row.values.dateApplied),
        followUpDate: calendarNoon(item.row.values.followUpDate),
        notes: item.row.values.notes,
        createdAt: now,
        updatedAt: now,
      }))
    );
    await db.insert(applicationEvents).values(
      batch.map((item) => ({
        applicationId: item.applicationId,
        eventType: "spreadsheet_imported",
        eventDate: now,
        payload: eventPayload(request, item.row.rowNumber, "add"),
        createdAt: now,
      }))
    );
  }
}

async function updateApplication(
  db: Db,
  userId: string,
  request: ImportRequest,
  candidate: StoredImportCandidate,
  row: NewRow,
  now: Date
): Promise<boolean> {
  const update = planTrackedUpdate(candidate, row.values);
  if (update.changes.length === 0) return false;

  const app = update.application;
  if (Object.keys(app).length > 0) {
    await db
      .update(applications)
      .set({
        ...(app.status ? { status: app.status } : {}),
        ...(app.dateApplied ? { dateApplied: calendarNoon(app.dateApplied) } : {}),
        ...(app.followUpDate ? { followUpDate: calendarNoon(app.followUpDate) } : {}),
        ...(app.notes ? { notes: app.notes } : {}),
        updatedAt: now,
      })
      .where(and(eq(applications.id, candidate.id), eq(applications.userId, userId)));
  }

  const job = update.job;
  if (candidate.jobDetailsEditable && Object.keys(job).length > 0) {
    const location = job.location ?? candidate.location;
    const workplaceType = job.workplaceType ?? candidate.workplaceType;
    const [current] = await db
      .select({ description: jobs.description })
      .from(jobs)
      .where(and(eq(jobs.id, candidate.jobId), eq(jobs.userId, userId)));
    const eligibility = classifyLocationEligibility({
      location,
      workplaceType,
      description: current?.description ?? IMPORTED_JOB_DESCRIPTION,
    });
    await db
      .update(jobs)
      .set({
        ...(job.location ? { location: job.location } : {}),
        ...(job.workplaceType ? { workplaceType: job.workplaceType } : {}),
        ...(job.jobUrl ? { jobUrl: job.jobUrl } : {}),
        locationEligibility: eligibility.class,
        locationFlags: eligibility.flags,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, candidate.jobId), eq(jobs.userId, userId)));
  }

  await db.insert(applicationEvents).values({
    applicationId: candidate.id,
    eventType: "spreadsheet_updated",
    eventDate: now,
    payload: eventPayload(request, row.rowNumber, "update", update.changes),
    createdAt: now,
  });

  // Later rows that match the same application see this row's result.
  Object.assign(candidate, {
    status: app.status ?? candidate.status,
    dateApplied: app.dateApplied ? toIso(calendarNoon(app.dateApplied)) : candidate.dateApplied,
    followUpDate: app.followUpDate ? toIso(calendarNoon(app.followUpDate)) : candidate.followUpDate,
    notes: app.notes ?? candidate.notes,
    location: job.location ?? candidate.location,
    workplaceType: job.workplaceType ?? candidate.workplaceType,
    jobUrl: job.jobUrl ?? candidate.jobUrl,
  });
  return true;
}

/**
 * Apply a validated import request for one user. Must run inside withUserDb's
 * transaction; see the comment at the top of this file.
 */
export async function importApplicationsDb(
  db: Db,
  userId: string,
  request: ImportRequest,
  now: Date = new Date()
): Promise<ImportResult> {
  // One import at a time per user, held until the transaction ends. A second
  // one waits (up to the lock timeout), then sees everything the first saved.
  await db.execute(sql`SELECT pg_advisory_xact_lock(${IMPORT_LOCK_NAMESPACE}::int, hashtext(${userId}))`);

  if (await alreadyImported(db, userId, request.importId)) return { status: "already_imported" };

  const candidates = await listImportCandidates(db, userId);
  const rows = requestRowResults(request);
  const plan = planImport(rows, findImportDuplicates(rows, candidates), request.resolutions);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const adds: NewRow[] = [];
  let unchanged = 0;
  for (const item of plan) {
    if (item.action === "add") adds.push({ rowNumber: item.rowNumber, values: item.values });
  }
  await addApplications(db, userId, request, adds, now);

  for (const item of plan) {
    if (item.action !== "update") continue;
    const candidate = byId.get(item.applicationId);
    // Not reachable: update targets come from the candidates above.
    if (!candidate) throw new Error("Application not found");
    const changed = await updateApplication(db, userId, request, candidate, item, now);
    if (!changed) unchanged++;
  }

  const summary = summarizePlan(plan);
  return { status: "imported", summary: { ...summary, update: summary.update - unchanged, unchanged } };
}

function postgresCode(error: unknown): string | null {
  // postgres.js errors carry the SQLSTATE in `code`; some wrappers put the original in `cause`.
  for (let current: unknown = error, depth = 0; current && depth < 3; depth++) {
    if (typeof current === "object" && "code" in current && typeof current.code === "string") {
      return current.code;
    }
    current = typeof current === "object" && "cause" in current ? current.cause : null;
  }
  return null;
}

/**
 * A message the person importing can act on. Every failure rolls the whole
 * import back, so each one says that nothing was imported.
 */
export function describeImportFailure(error: unknown): string {
  const code = postgresCode(error);
  const message = error instanceof Error ? error.message : "";
  if (code === "55P03") {
    return "Another import is still saving. Wait a moment, then try again. Nothing was imported.";
  }
  if (code === "57014") {
    return "The import took too long, so nothing was saved. Try again, or split the file into smaller parts.";
  }
  if (code === "22P05" || code === "22021") {
    return "A value in the file has characters that cannot be saved. Nothing was imported.";
  }
  if (/invalid input value for enum application_status/i.test(message)) {
    return "Some statuses are not available until migration 0015_application_tracker_status.sql is applied. Nothing was imported.";
  }
  return "The import could not be saved, so nothing was imported. Try again in a moment.";
}
