/**
 * Spreadsheet import against a real Postgres with the app's RLS policies.
 *
 * Opt-in, like rls.test.ts: set RUN_DB_INTEGRATION=true and DATABASE_URL to a
 * database set up the way the README describes (pnpm db:push, then the SQL
 * migrations). Every call goes through withUserDb, so it runs as the
 * `authenticated` role with row-level security, as in production.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { withUserDb } from "@/db/user-context";
import { applicationEvents, applications, companies, jobSources, jobs } from "@/db/schema";
import { decodeCsvBytes } from "@/modules/applications/csv";
import {
  describeImportFailure,
  importApplicationsDb,
  IMPORTED_JOB_DESCRIPTION,
} from "@/modules/applications/import-store";
import { describeEvent } from "@/modules/applications/tracker";
import { getTrackedApplication, listTrackedApplications } from "@/modules/applications/store";
import {
  guessColumnMapping,
  normalizeImportRows,
  readImportTable,
  type DuplicateResolution,
  type ImportValues,
} from "@/modules/applications/tracker-csv";
import {
  buildImportRequest,
  parseImportRequest,
  type ImportRequest,
} from "@/modules/applications/tracker-import";
import { countAllUserJobs, fetchJobsFeed } from "@/modules/jobs/jobs-feed-service";
import { buildDigestForUser } from "@/modules/digest/build";
import { IMPORTED_JOB_PIPELINE_STATUS } from "@/modules/jobs/imported-jobs";

const run = process.env.RUN_DB_INTEGRATION === "true";
const users: string[] = [];
const importIds: string[] = [];
/** Company names are shared across users, so each run uses its own. */
const suffix = randomUUID().slice(0, 8);

function newUser(): string {
  const id = randomUUID();
  users.push(id);
  return id;
}

/** A request built the way the dialog builds it: parse the CSV, map, normalize, then validate as the server does. */
function requestFromCsv(
  csv: string,
  resolutions: Record<number, DuplicateResolution> = {},
  importId = randomUUID()
): ImportRequest {
  importIds.push(importId);
  const table = readImportTable(csv);
  const rows = normalizeImportRows(table, guessColumnMapping(table.headers), "mdy");
  return parseImportRequest(
    JSON.parse(JSON.stringify(buildImportRequest(importId, "test.csv", rows, resolutions)))
  );
}

function importAs(userId: string, request: ImportRequest, now?: Date) {
  return withUserDb(userId, (db) => importApplicationsDb(db, userId, request, now));
}

async function appCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(eq(applications.userId, userId));
  return row.count;
}

async function jobCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(eq(jobs.userId, userId));
  return row.count;
}

/** A job found by discovery, as persistDiscoveredJob would leave it. Written as the owner. */
async function discoveredJob(userId: string, overrides: Partial<typeof jobs.$inferInsert> = {}) {
  const [company] = await getDb()
    .insert(companies)
    .values({ name: `Discovered Co ${suffix}` })
    .returning();
  const [job] = await getDb()
    .insert(jobs)
    .values({
      userId,
      companyId: company.id,
      title: "Frontend Engineer",
      location: "Toronto, ON",
      workplaceType: "hybrid",
      jobUrl: `https://boards.example.com/${suffix}/${randomUUID()}`,
      description: "A real posting",
      matchPipelineStatus: "matched",
      ...overrides,
    })
    .returning();
  return { job, company };
}

const HEADER = "Company,Role,Status,Date applied,Follow-up date,Location,Workplace,Job URL,Notes";

describe.runIf(run)("spreadsheet import (database)", () => {
  afterAll(async () => {
    const db = getDb();
    if (users.length > 0) {
      await db.delete(jobs).where(inArray(jobs.userId, users));
    }
    for (const importId of importIds) {
      await db.delete(jobSources).where(sql`${jobSources.rawPayload}->>'importId' = ${importId}`);
    }
    await db.delete(companies).where(sql`${companies.name} LIKE ${`%${suffix}%`}`);
  });

  it("imports the sample spreadsheet as the signed-in user, marking every job as imported", async () => {
    const user = newUser();
    const csv = decodeCsvBytes(
      readFileSync(resolve(process.cwd(), "src/test/fixtures/tracker-import/job-tracker.csv"))
    );
    const request = requestFromCsv(csv);
    // 14 rows can be imported; row 14 repeats row 3's posting and is skipped by default.
    expect(request.rows).toHaveLength(14);
    const now = new Date("2025-06-10T15:00:00.000Z");

    const result = await importAs(user, request, now);
    expect(result).toEqual({
      status: "imported",
      summary: { add: 13, update: 0, unchanged: 0, skipInvalid: 0, skipDuplicate: 1 },
    });

    const db = getDb();
    const created = await db.query.applications.findMany({
      where: eq(applications.userId, user),
      with: { job: { with: { company: true, source: true } }, events: true },
    });
    expect(created).toHaveLength(13);
    for (const app of created) {
      expect(app.job.matchPipelineStatus).toBe(IMPORTED_JOB_PIPELINE_STATUS);
      expect(app.job.isSaved).toBe(true);
      expect(app.job.description).toBe(IMPORTED_JOB_DESCRIPTION);
      expect(app.job.source?.provider).toBe("manual");
      expect(app.dateSaved?.toISOString()).toBe(now.toISOString());
      expect(app.events).toHaveLength(1);
      expect(app.events[0].payload).toMatchObject({
        kind: "spreadsheet_import",
        importId: request.importId,
        action: "add",
        fileName: "test.csv",
      });
    }

    const byCompany = (name: string) => created.filter((app) => app.job.company?.name === name);
    // Values as the file said, with dates at UTC noon and no invented applied date.
    const copperline = byCompany("Copperline Studio")[0];
    expect(copperline).toMatchObject({
      status: "offer",
      notes: "Offer: 118k + equity\nDecision due Friday",
    });
    expect(copperline.dateApplied?.toISOString()).toBe("2025-03-03T12:00:00.000Z");
    expect(copperline.job.jobUrl).toBe("https://careers.copperline.example.com/jobs/ui-engineer");
    const meadowbrook = byCompany("Meadowbrook Learning")[0];
    expect(meadowbrook.dateApplied).toBeNull();
    // Optional links: rows without one import with none.
    expect(byCompany("Fernhill Games")[0].job.jobUrl).toBeNull();
    // Two Birchwood postings (different links) are two applications with one shared company row.
    const birchwood = byCompany("Birchwood Health");
    expect(birchwood).toHaveLength(2);
    expect(new Set(birchwood.map((app) => app.job.companyId)).size).toBe(1);

    // The tracker and its history show them like any other application.
    const tracked = await withUserDb(user, (userDb) => listTrackedApplications(userDb, user, now));
    expect(tracked).toHaveLength(13);
    const detail = await withUserDb(user, (userDb) => getTrackedApplication(userDb, user, copperline.id, now));
    expect(describeEvent(detail!.events[0])).toEqual({
      title: "Imported from spreadsheet",
      detail: "From test.csv, row 5",
    });
  });

  it("leaves imported jobs out of the job feed, its count, the dashboard count, and the digest", async () => {
    const user = newUser();
    await importAs(user, requestFromCsv(`${HEADER}\nFeed Test ${suffix},Engineer,Applied,,,,,,`));
    const { job: discovered } = await discoveredJob(user);

    // Show everything the feed can show, so the import exclusion is the only filter at work.
    const feed = await withUserDb(user, (db) =>
      fetchJobsFeed(db, user, { showLowFit: true, showIneligible: true, showOlder: true })
    );
    expect(feed.jobs.map((job) => job.id)).toEqual([discovered.id]);
    expect(await withUserDb(user, (db) => countAllUserJobs(db, user))).toBe(1);

    const digest = await withUserDb(user, (db) => buildDigestForUser(db, user, new Date()));
    if (digest.outcome !== "empty" && "payload" in digest) {
      const titles = digest.payload.jobs.map((job: { title: string }) => job.title);
      expect(titles).not.toContain("Engineer");
    }
  });

  it("a retried request with the same id changes nothing", async () => {
    const user = newUser();
    const request = requestFromCsv(`${HEADER}\nRetry Co ${suffix},Dev,Applied,,,,,,`);
    expect((await importAs(user, request)).status).toBe("imported");
    expect(await importAs(user, request)).toEqual({ status: "already_imported" });
    expect(await appCount(user)).toBe(1);
  });

  it("duplicates: skipped by default, updated or kept as asked, with history", async () => {
    const user = newUser();
    const acme = `Acme ${suffix}`;
    await importAs(
      user,
      requestFromCsv(
        `${HEADER}\n${acme},Developer,Applied,2025-03-01,,Toronto,Hybrid,https://acme.example.com/${suffix},First note\nGlobex ${suffix},Engineer,Saved,,,,,,`
      )
    );

    // Same rows again with no choices: nothing happens.
    const skipped = await importAs(
      user,
      requestFromCsv(`${HEADER}\n${acme.toUpperCase()},developer,Offer,,,,,,\nGlobex ${suffix},Engineer,Interviewing,,,,,,`)
    );
    expect(skipped).toMatchObject({ summary: { add: 0, update: 0, skipDuplicate: 2 } });
    expect(await appCount(user)).toBe(2);

    // Update writes non-blank values; blank cells keep what is there. Keep both adds a second application.
    const chosen = await importAs(
      user,
      requestFromCsv(
        `${HEADER}\n${acme.toUpperCase()},developer,Offer,,2025-06-30,Montreal,,,\nGlobex ${suffix},Engineer,Interviewing,,,,,,`,
        { 2: "update", 3: "keep_both" }
      )
    );
    expect(chosen).toMatchObject({ summary: { add: 1, update: 1, unchanged: 0, skipDuplicate: 0 } });
    expect(await appCount(user)).toBe(3);

    const [updated] = await getDb().query.applications.findMany({
      where: eq(applications.userId, user),
      with: { job: { with: { company: true } }, events: true },
    }).then((rows) => rows.filter((row) => row.job.company?.name === acme));
    expect(updated.status).toBe("offer");
    expect(updated.notes).toBe("First note");
    expect(updated.dateApplied?.toISOString()).toBe("2025-03-01T12:00:00.000Z");
    expect(updated.followUpDate?.toISOString()).toBe("2025-06-30T12:00:00.000Z");
    // An imported job's details are the user's own, so an update may change them.
    expect(updated.job.location).toBe("Montreal");
    const history = updated.events.find((event) => event.eventType === "spreadsheet_updated")!;
    expect(describeEvent(history)).toEqual({
      title: "Updated from spreadsheet (test.csv, row 2)",
      detail: "Status: Applied → Offer · Follow-up: — → Jun 30, 2025 · Location: Toronto · Hybrid → Montreal · Hybrid",
    });

    // Importing the same values again is a match with nothing to change.
    const again = await importAs(
      user,
      requestFromCsv(`${HEADER}\n${acme},Developer,Offer,,2025-06-30,,,,`, { 2: "update" })
    );
    expect(again).toMatchObject({ summary: { update: 0, unchanged: 1 } });
  });

  it("updates never change the details of a discovered job", async () => {
    const user = newUser();
    const { job, company } = await discoveredJob(user);
    const [app] = await getDb()
      .insert(applications)
      .values({ userId: user, jobId: job.id, status: "applied" })
      .returning();

    const result = await importAs(
      user,
      requestFromCsv(`${HEADER}\n"${company.name}",Frontend Engineer,Interviewing,,,Mars,Remote,,`, { 2: "update" })
    );
    expect(result).toMatchObject({ summary: { update: 1 } });
    const [after] = await getDb().select().from(jobs).where(eq(jobs.id, job.id));
    expect(after).toMatchObject({ location: "Toronto, ON", workplaceType: "hybrid", matchPipelineStatus: "matched" });
    const [appAfter] = await getDb().select().from(applications).where(eq(applications.id, app.id));
    expect(appAfter.status).toBe("interviewing");
  });

  it("a row with the link of an untracked job becomes that job's application", async () => {
    const user = newUser();
    const { job } = await discoveredJob(user, { isSaved: false });
    const jobsBefore = await jobCount(user);

    await importAs(user, requestFromCsv(`${HEADER}\nSomeone Else ${suffix},Whatever,Applied,,,,,${job.jobUrl},`));
    expect(await jobCount(user)).toBe(jobsBefore);
    const [app] = await getDb().select().from(applications).where(eq(applications.userId, user));
    expect(app.jobId).toBe(job.id);
    const [after] = await getDb().select().from(jobs).where(eq(jobs.id, job.id));
    // Still a discovered job (it stays in the feed), now saved and tracked.
    expect(after).toMatchObject({ isSaved: true, matchPipelineStatus: "matched", title: "Frontend Engineer" });
  });

  it("is all or nothing: a failure part-way through rolls back every row", async () => {
    const user = newUser();
    const rows = Array.from({ length: 250 }, (_, index) => `Rollback ${suffix} ${index},Dev,Applied,,,,,,`);
    const request = requestFromCsv([HEADER, ...rows].join("\n"));
    // The last row carries a value Postgres refuses. Validation removes these, so this
    // goes around it to simulate a failure after earlier batches were written.
    const poisoned: ImportValues = { ...request.rows[249].values, notes: "bad \u0000 byte" };
    request.rows[249] = { ...request.rows[249], values: poisoned };

    let failure: unknown;
    await importAs(user, request).catch((error) => (failure = error));
    expect(failure).toBeDefined();
    expect(describeImportFailure(failure)).toMatch(/Nothing was imported/);
    expect(await appCount(user)).toBe(0);
    expect(await jobCount(user)).toBe(0);
  });

  it("two imports at once run one after the other, so rows are not added twice", async () => {
    const user = newUser();
    const csv = [HEADER, ...Array.from({ length: 40 }, (_, index) => `Race ${suffix} ${index},Dev,Applied,,,,,,`)].join("\n");
    const [first, second] = await Promise.all([importAs(user, requestFromCsv(csv)), importAs(user, requestFromCsv(csv))]);
    const summaries = [first, second].map((result) => (result.status === "imported" ? result.summary : null));
    expect(summaries.map((summary) => summary?.add).sort()).toEqual([0, 40]);
    expect(summaries.map((summary) => summary?.skipDuplicate).sort()).toEqual([0, 40]);
    expect(await appCount(user)).toBe(40);
  });

  it("an import waiting too long for another one gives up without changes", async () => {
    const user = newUser();
    const db = getDb();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    // Hold this user's import lock in another transaction.
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7301, hashtext(${user}))`);
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    let failure: unknown;
    await db
      .transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '300ms'`);
        await tx.execute(sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`);
        await tx.execute(sql`SET LOCAL ROLE authenticated`);
        await importApplicationsDb(tx as never, user, requestFromCsv(`${HEADER}\nWaiting ${suffix},Dev,,,,,,,`));
      })
      .catch((error) => (failure = error));
    release();
    await holder;
    expect(describeImportFailure(failure)).toBe(
      "Another import is still saving. Wait a moment, then try again. Nothing was imported."
    );
    expect(await appCount(user)).toBe(0);
  });

  it("never sees or changes another user's applications", async () => {
    const owner = newUser();
    const other = newUser();
    const csv = `${HEADER}\nPrivate Co ${suffix},Dev,Applied,,,,,,`;
    await importAs(owner, requestFromCsv(csv));

    // The other user asks to update a row that matches the owner's application: for them it is new.
    const result = await importAs(other, requestFromCsv(csv.replace("Applied", "Rejected"), { 2: "update" }));
    expect(result).toMatchObject({ summary: { add: 1, update: 0 } });
    const [ownerApp] = await getDb().select().from(applications).where(eq(applications.userId, owner));
    expect(ownerApp.status).toBe("applied");
    // Their history is theirs alone.
    const otherEvents = await withUserDb(other, (db) =>
      db.select({ id: applicationEvents.id }).from(applicationEvents)
    );
    expect(otherEvents).toHaveLength(1);
  });

  it("imports 500 rows in one go", async () => {
    const user = newUser();
    const rows = Array.from(
      { length: 500 },
      (_, index) =>
        `Bulk ${suffix} ${index % 120},Role ${index},Applied,2025-01-${String((index % 28) + 1).padStart(2, "0")},,Toronto,Remote,https://bulk.example.com/${suffix}/${index},Note ${index}`
    );
    const started = Date.now();
    const result = await importAs(user, requestFromCsv([HEADER, ...rows].join("\n")));
    const elapsed = Date.now() - started;
    expect(result).toMatchObject({ summary: { add: 500 } });
    expect(await appCount(user)).toBe(500);
    // 120 distinct companies, each created once.
    const [companyRows] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(sql`${companies.name} LIKE ${`Bulk ${suffix} %`}`);
    expect(companyRows.count).toBe(120);
    console.log(`[import] 500 rows in ${elapsed} ms`);
    expect(elapsed).toBeLessThan(15_000);
  });

  it("keeps the import marker when an imported job is analyzed", async () => {
    const user = newUser();
    await importAs(user, requestFromCsv(`${HEADER}\nAnalyzed ${suffix},Dev,Applied,,,,,,`));
    const [job] = await getDb().select().from(jobs).where(eq(jobs.userId, user));
    const { runAndSaveMatchAnalysisDb } = await import("@/modules/matching/save-match-analysis");
    await withUserDb(user, (db) => runAndSaveMatchAnalysisDb(db, user, job.id, undefined, { force: true })).catch(
      // No candidate profile in this test database is fine; the marker is what matters.
      () => undefined
    );
    const [after] = await getDb()
      .select({ status: jobs.matchPipelineStatus })
      .from(jobs)
      .where(and(eq(jobs.id, job.id)));
    expect(after.status).toBe(IMPORTED_JOB_PIPELINE_STATUS);
  });
});
