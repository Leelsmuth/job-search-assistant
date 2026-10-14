import { and, eq, sql } from "drizzle-orm";
import {
  applicationEvents,
  applications,
  companies,
  jobSources,
  jobs,
  type ApplicationEventPayload,
} from "@/db/schema";
import {
  filterApplicationsForOwnedJobs,
  getApplicationForJob,
  requireOwnedJob,
  type Db,
} from "@/server/actions/helpers";
import { classifyLocationEligibility } from "@/modules/location/eligibility";
import { hashJobDescription } from "@/modules/ingestion/description-hash";
import type { ApplicationStatus } from "@/lib/utils";
import {
  appliedDateForStatus,
  attentionFor,
  formatCalendarDate,
  formatWorkLocation,
  isApplicationStatus,
  isUuid,
  latestActivityAt,
  parseNotes,
  parseOptionalCalendarField,
  pipelineStage,
  safeHttpUrl,
  type ManualApplicationInput,
  type TrackedApplication,
  type TrackedApplicationDetail,
  type TrackedEvent,
} from "@/modules/applications/tracker";

const MANUAL_DESCRIPTION = "Logged manually in the application tracker.";

type ApplicationRow = {
  id: string;
  jobId: string;
  status: string;
  notes: string | null;
  dateApplied: Date | null;
  followUpDate: Date | null;
  updatedAt: Date;
  job: {
    userId: string;
    title: string;
    jobUrl: string | null;
    location: string | null;
    workplaceType: string | null;
    company: { name: string } | null;
  } | null;
  events: Array<{ createdAt: Date; eventDate: Date | null }>;
};

function toIso(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function toTracked(row: ApplicationRow, now: Date): TrackedApplication {
  const job = row.job;
  const lastActivity = latestActivityAt(row.updatedAt, row.events);
  return {
    id: row.id,
    jobId: row.jobId,
    status: row.status,
    stage: pipelineStage(row.status),
    notes: row.notes,
    dateApplied: toIso(row.dateApplied),
    followUpDate: toIso(row.followUpDate),
    lastActivityAt: lastActivity.toISOString(),
    companyName: job?.company?.name ?? "Unknown company",
    title: job?.title ?? "Unknown role",
    jobUrl: safeHttpUrl(job?.jobUrl),
    location: job?.location ?? null,
    workplaceType: job?.workplaceType ?? null,
    locationLabel: formatWorkLocation(job?.location, job?.workplaceType),
    attention: attentionFor({
      status: row.status,
      dateApplied: row.dateApplied,
      followUpDate: row.followUpDate,
      lastActivityAt: lastActivity,
      now,
    }),
  };
}

async function ownedApplication(db: Db, userId: string, applicationId: string) {
  if (!isUuid(applicationId)) throw new Error("Application not found");
  const app = await db.query.applications.findFirst({
    where: and(eq(applications.id, applicationId), eq(applications.userId, userId)),
  });
  if (!app) throw new Error("Application not found");
  await requireOwnedJob(db, userId, app.jobId);
  return app;
}

async function insertEvent(
  db: Db,
  input: {
    applicationId: string;
    eventType: string;
    notes?: string | null;
    payload: ApplicationEventPayload;
    eventDate?: Date;
  }
) {
  await db.insert(applicationEvents).values({
    applicationId: input.applicationId,
    eventType: input.eventType,
    eventDate: input.eventDate ?? new Date(),
    notes: input.notes ?? null,
    payload: input.payload,
  });
}

export async function listTrackedApplications(
  db: Db,
  userId: string,
  now = new Date()
): Promise<TrackedApplication[]> {
  const rows = await db.query.applications.findMany({
    where: eq(applications.userId, userId),
    with: {
      job: { with: { company: true } },
      events: { columns: { createdAt: true, eventDate: true } },
    },
  });
  return filterApplicationsForOwnedJobs(userId, rows).map((row) => toTracked(row, now));
}

export async function getTrackedApplication(
  db: Db,
  userId: string,
  applicationId: string,
  now = new Date()
): Promise<TrackedApplicationDetail | null> {
  if (!isUuid(applicationId)) return null;
  const row = await db.query.applications.findFirst({
    where: and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    with: {
      job: { with: { company: true } },
      events: true,
    },
  });
  if (!row?.job || row.job.userId !== userId) return null;

  const tracked = toTracked(row, now);
  const events: TrackedEvent[] = row.events
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      eventDate: toIso(event.eventDate),
      createdAt: event.createdAt.toISOString(),
      notes: event.notes,
      payload: event.payload,
    }));

  return { ...tracked, events };
}

export async function setApplicationStatus(
  db: Db,
  userId: string,
  applicationId: string,
  status: ApplicationStatus,
  notes?: string
) {
  if (!isApplicationStatus(status)) throw new Error("Unknown status");
  const app = await ownedApplication(db, userId, applicationId);
  const nextNotes = notes === undefined ? undefined : parseNotes(notes);
  const statusChanged = app.status !== status;
  const notesChanged = nextNotes !== undefined && (app.notes ?? "") !== nextNotes;

  const updates: {
    status: ApplicationStatus;
    updatedAt: Date;
    notes?: string;
    dateApplied?: Date;
  } = { status, updatedAt: new Date() };
  if (nextNotes !== undefined) updates.notes = nextNotes;
  if (status === "applied" && !app.dateApplied) updates.dateApplied = new Date();

  if (statusChanged || notesChanged) {
    await db
      .update(applications)
      .set(updates)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));
  }

  if (statusChanged) {
    await insertEvent(db, {
      applicationId,
      eventType: "status_changed",
      payload: { kind: "status_change", fromStatus: app.status, toStatus: status },
    });
  }
  if (notesChanged) {
    await insertEvent(db, {
      applicationId,
      eventType: "notes_updated",
      notes: nextNotes,
      payload: { kind: "notes" },
    });
  }

  return { changed: statusChanged, applicationId, jobId: app.jobId };
}

export async function setApplicationNotes(db: Db, userId: string, applicationId: string, notes: string) {
  const app = await ownedApplication(db, userId, applicationId);
  const nextNotes = parseNotes(notes);
  if ((app.notes ?? "") === nextNotes) return { changed: false, jobId: app.jobId };

  await db
    .update(applications)
    .set({ notes: nextNotes, updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));
  await insertEvent(db, {
    applicationId,
    eventType: "notes_updated",
    notes: nextNotes,
    payload: { kind: "notes" },
  });
  return { changed: true, jobId: app.jobId };
}

export async function setApplicationFollowUp(
  db: Db,
  userId: string,
  applicationId: string,
  followUpDate: Date | null
) {
  const app = await ownedApplication(db, userId, applicationId);
  const previous = formatCalendarDate(app.followUpDate);
  const next = formatCalendarDate(followUpDate);
  if (previous === next) return { changed: false, jobId: app.jobId };

  await db
    .update(applications)
    .set({ followUpDate, updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));
  await insertEvent(db, {
    applicationId,
    eventType: "follow_up_set",
    payload: { kind: "follow_up", followUpDate: next || null },
  });
  return { changed: true, jobId: app.jobId };
}

export async function setApplicationAppliedDate(
  db: Db,
  userId: string,
  applicationId: string,
  dateApplied: Date | null
) {
  const app = await ownedApplication(db, userId, applicationId);
  const previous = formatCalendarDate(app.dateApplied);
  const next = formatCalendarDate(dateApplied);
  if (previous === next) return { changed: false, jobId: app.jobId };

  await db
    .update(applications)
    .set({ dateApplied, updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));
  await insertEvent(db, {
    applicationId,
    eventType: "applied_date_set",
    payload: { kind: "applied_date", dateApplied: next || null },
  });
  return { changed: true, jobId: app.jobId };
}

async function findCompany(db: Db, name: string) {
  const [existing] = await db
    .select()
    .from(companies)
    .where(sql`lower(${companies.name}) = ${name.toLowerCase()}`)
    .limit(1);
  return existing ?? null;
}

async function findJobByUrl(db: Db, userId: string, jobUrl: string) {
  return db.query.jobs.findFirst({
    where: and(eq(jobs.userId, userId), eq(jobs.jobUrl, jobUrl)),
  });
}

export async function addManualApplication(db: Db, userId: string, input: ManualApplicationInput) {
  const now = new Date();
  let job = await findJobByUrl(db, userId, input.jobUrl);
  if (!job) {
    const existingCompany = await findCompany(db, input.company);
    const companyRow =
      existingCompany ??
      (
        await db.insert(companies).values({ name: input.company }).returning()
      )[0];
    if (!companyRow) throw new Error("Could not save the company");

    const [source] = await db
      .insert(jobSources)
      .values({
        provider: "manual",
        sourceUrl: input.jobUrl,
      })
      .returning();
    if (!source) throw new Error("Could not save the job source");

    const eligibility = classifyLocationEligibility({
      location: input.location,
      workplaceType: input.workplaceType,
      description: MANUAL_DESCRIPTION,
    });

    const [created] = await db
      .insert(jobs)
      .values({
        userId,
        companyId: companyRow.id,
        sourceId: source.id,
        title: input.title,
        location: input.location,
        workplaceType: input.workplaceType,
        jobUrl: input.jobUrl,
        description: MANUAL_DESCRIPTION,
        descriptionHash: hashJobDescription(MANUAL_DESCRIPTION),
        status: "active",
        isSaved: true,
        matchPipelineStatus: "manual",
        dateDiscovered: now,
        locationEligibility: eligibility.class,
        locationFlags: eligibility.flags,
      })
      .returning();
    if (!created) throw new Error("Could not save the job");
    job = created;
  }

  const existingApplication = await getApplicationForJob(db, userId, job.id);
  if (existingApplication) {
    throw new Error("You already track an application for this job");
  }

  const dateApplied = appliedDateForStatus(input.status, input.dateApplied, now);
  const [application] = await db
    .insert(applications)
    .values({
      userId,
      jobId: job.id,
      status: input.status,
      dateSaved: now,
      dateApplied,
      followUpDate: input.followUpDate,
      notes: input.notes,
    })
    .returning();
  if (!application) throw new Error("Could not save the application");

  await insertEvent(db, {
    applicationId: application.id,
    eventType: "manual_added",
    notes: input.notes,
    payload: {
      kind: "manual_add",
      company: input.company,
      title: input.title,
      jobUrl: input.jobUrl,
      status: input.status,
    },
  });

  if (input.followUpDate) {
    await insertEvent(db, {
      applicationId: application.id,
      eventType: "follow_up_set",
      payload: {
        kind: "follow_up",
        followUpDate: formatCalendarDate(input.followUpDate),
      },
    });
  }

  return { applicationId: application.id, jobId: job.id };
}

export function followUpFromUnknown(value: unknown): Date | null {
  return parseOptionalCalendarField(value, "Follow-up date");
}

export function appliedDateFromUnknown(value: unknown): Date | null {
  return parseOptionalCalendarField(value, "Applied date");
}
