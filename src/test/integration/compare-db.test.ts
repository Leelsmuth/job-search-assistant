/**
 * The signed-in compare tray and priorities against a real Postgres with the
 * app's RLS policies.
 *
 * Opt-in, like the other integration tests: set RUN_DB_INTEGRATION=true and
 * DATABASE_URL to a database set up the way the README describes (pnpm
 * db:push, then the SQL migrations, including 0025_compare_tray.sql). Every
 * call goes through withUserDb, so it runs as the `authenticated` role with
 * row-level security, as in production.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { withUserDb } from "@/db/user-context";
import { applications, companies, jobs, searchPreferences } from "@/db/schema";
import {
  loadCompareRoles,
  loadCompareState,
  saveComparePriorities,
  saveCompareSlots,
} from "@/modules/compare/compare-db";
import { loadSearchPreferences } from "@/modules/matching/load-search-preferences";
import { defaultSearchPreferences } from "@/modules/matching/search-preferences";

const run = process.env.RUN_DB_INTEGRATION === "true";
const users: string[] = [];
const companyIds: string[] = [];
const suffix = randomUUID().slice(0, 8);

function newUser(): string {
  const id = randomUUID();
  users.push(id);
  return id;
}

/** A job owned by `userId`, written directly (as discovery would). */
async function job(userId: string, overrides: Partial<typeof jobs.$inferInsert> = {}) {
  const [company] = await getDb()
    .insert(companies)
    .values({ name: `Compare Co ${suffix} ${randomUUID().slice(0, 4)}` })
    .returning();
  companyIds.push(company.id);
  const [row] = await getDb()
    .insert(jobs)
    .values({
      userId,
      companyId: company.id,
      title: "Senior Frontend Engineer",
      location: "Remote - Canada",
      workplaceType: "remote",
      description: "React and TypeScript. Remote within Canada.",
      salaryMin: 140000,
      salaryMax: 165000,
      salaryCurrency: "CAD",
      fitScore: 88.6,
      frontendFitReasons: ["React + TypeScript"],
      requiredQualifications: ["5+ years of React"],
      preferredQualifications: ["Accessibility audits"],
      technologies: ["React", "TypeScript"],
      postedAt: new Date("2026-05-30T12:00:00.000Z"),
      postedAtSource: "provider",
      matchPipelineStatus: "matched",
      ...overrides,
    })
    .returning();
  return { ...row, companyName: company.name };
}

const as = <T>(userId: string, fn: Parameters<typeof withUserDb<T>>[1]) => withUserDb(userId, fn);

describe.runIf(run)("compare tray on the account", () => {
  afterAll(async () => {
    const db = getDb();
    if (users.length > 0) {
      await db.delete(searchPreferences).where(inArray(searchPreferences.userId, users));
      await db.delete(jobs).where(inArray(jobs.userId, users));
    }
    if (companyIds.length > 0) await db.delete(companies).where(inArray(companies.id, companyIds));
  });

  it("starts empty, on the suggested order, for a user who has never compared", async () => {
    const user = newUser();
    const state = await as(user, (db) => loadCompareState(db, user));
    expect(state).toEqual({
      slots: [null, null, null, null],
      roles: [],
      priorities: { order: ["fit", "location", "salary", "remote", "freshness"], saved: false },
      available: true,
    });
  });

  it("keeps each job in the slot it was dropped in, and loads it back", async () => {
    const user = newUser();
    const first = await job(user, { title: "Frontend Engineer, GraphQL" });
    const second = await job(user, { title: "UI Engineer", workplaceType: "hybrid", location: "Toronto, ON" });

    const saved = await as(user, (db) => saveCompareSlots(db, user, [null, second.id, null, first.id]));
    expect(saved.slots).toEqual([null, second.id, null, first.id]);
    expect(saved.roles.map((role) => role.id)).toEqual([second.id, first.id]);

    const state = await as(user, (db) => loadCompareState(db, user));
    expect(state.slots).toEqual([null, second.id, null, first.id]);
    expect(state.roles.map((role) => role.title)).toEqual(["UI Engineer", "Frontend Engineer, GraphQL"]);
  });

  it("builds roles with the feed's numbers and the job's details", async () => {
    const user = newUser();
    const posted = await job(user);
    await getDb().insert(applications).values({ userId: user, jobId: posted.id, status: "applied" });

    const [role] = await as(user, (db) => loadCompareRoles(db, user, [posted.id]));
    expect(role).toMatchObject({
      id: posted.id,
      title: "Senior Frontend Engineer",
      company: posted.companyName,
      href: `/jobs/${posted.id}`,
      fitScore: 89, // the stored score, rounded, as the feed shows it
      salaryMin: 140000,
      salaryMax: 165000,
      salaryCurrency: "CAD",
      locationClass: "remote_canada",
      locationBlocker: null,
      postedAt: "2026-05-30T12:00:00.000Z",
      postedAtSource: "provider",
      fitReasons: ["React + TypeScript"],
      requirements: ["5+ years of React"],
      niceToHave: ["Accessibility audits"],
      technologies: ["React", "TypeScript"],
      trackerStatus: "Applied",
      classification: null,
    });
  });

  it("scores a job with no stored fit the way the feed does", async () => {
    const user = newUser();
    const unscored = await job(user, { fitScore: null, frontendFitReasons: [] });
    const [role] = await as(user, (db) => loadCompareRoles(db, user, [unscored.id]));
    expect(typeof role.fitScore).toBe("number");
  });

  it("uses the user's location settings", async () => {
    const user = newUser();
    const hybrid = await job(user, { workplaceType: "hybrid", location: "Toronto, ON" });
    await getDb()
      .insert(searchPreferences)
      .values({ userId: user, ...defaultSearchPreferences(), includeHybridGta: false });
    const [role] = await as(user, (db) => loadCompareRoles(db, user, [hybrid.id]));
    expect(role.locationClass).toBe("hybrid_gta");
    expect(role.locationBlocker?.detail).toBe("Hybrid, which is off in your Settings");
  });

  it("only keeps the user's own jobs", async () => {
    const owner = newUser();
    const other = newUser();
    const mine = await job(owner);
    const theirs = await job(other);

    const saved = await as(owner, (db) =>
      saveCompareSlots(db, owner, [theirs.id, mine.id, "not-a-uuid", randomUUID()])
    );
    expect(saved.slots).toEqual([null, mine.id, null, null]);
    expect(saved.roles.map((role) => role.id)).toEqual([mine.id]);
  });

  it("keeps each user's tray and ranking private", async () => {
    const owner = newUser();
    const other = newUser();
    const mine = await job(owner);
    await as(owner, (db) => saveCompareSlots(db, owner, [mine.id]));
    await as(owner, (db) => saveComparePriorities(db, owner, ["salary"]));

    const seenByOther = await as(other, (db) => loadCompareState(db, other));
    expect(seenByOther.slots).toEqual([null, null, null, null]);
    expect(seenByOther.priorities.saved).toBe(false);
    // Row-level security: the other user cannot see the owner's row at all.
    const rows = await as(other, (db) =>
      db.select().from(searchPreferences).where(eq(searchPreferences.userId, owner))
    );
    expect(rows).toEqual([]);
  });

  it("saves the ranking and brings it back", async () => {
    const user = newUser();
    const saved = await as(user, (db) => saveComparePriorities(db, user, ["salary", "remote", "bogus"]));
    expect(saved).toEqual(["salary", "remote", "fit", "location", "freshness"]);
    const state = await as(user, (db) => loadCompareState(db, user));
    expect(state.priorities).toEqual({ order: saved, saved: true });
  });

  it("creates the preferences row with the app's defaults, not the column defaults", async () => {
    const user = newUser();
    await as(user, (db) => saveComparePriorities(db, user, ["salary"]));
    const preferences = await as(user, (db) => loadSearchPreferences(db, user));
    const defaults = defaultSearchPreferences();
    expect(preferences.discoverCuratedBoards).toBe(defaults.discoverCuratedBoards);
    expect(preferences.targetTitles).toEqual(defaults.targetTitles);
    expect(preferences.gtaCities).toEqual(defaults.gtaCities);
    // The stored row itself, not just what the loader makes of it (it fills empty lists in).
    const [row] = await getDb().select().from(searchPreferences).where(eq(searchPreferences.userId, user));
    expect(row.targetTitles).toEqual(defaults.targetTitles);
    expect(row.gtaCities).toEqual(defaults.gtaCities);
    expect(row.discoverCuratedBoards).toBe(defaults.discoverCuratedBoards);
  });

  it("changes nothing but the compare columns on an existing row", async () => {
    const user = newUser();
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    await getDb()
      .insert(searchPreferences)
      .values({ userId: user, ...defaultSearchPreferences(), minFitToShow: 70, updatedAt });
    const mine = await job(user);
    await as(user, (db) => saveCompareSlots(db, user, [mine.id]));

    const [row] = await getDb().select().from(searchPreferences).where(eq(searchPreferences.userId, user));
    expect(row.minFitToShow).toBe(70);
    // updated_at marks search setting changes; adding to the tray is not one.
    expect(row.updatedAt.toISOString()).toBe(updatedAt.toISOString());
    expect(row.compareSlots).toEqual([mine.id, null, null, null]);
  });

  it("drops a job from the tray once it is deleted", async () => {
    const user = newUser();
    const kept = await job(user);
    const deleted = await job(user);
    await as(user, (db) => saveCompareSlots(db, user, [kept.id, deleted.id]));
    await getDb().delete(jobs).where(eq(jobs.id, deleted.id));

    const state = await as(user, (db) => loadCompareState(db, user));
    expect(state.slots).toEqual([kept.id, null, null, null]);
    expect(state.roles.map((role) => role.id)).toEqual([kept.id]);
  });

  it("refuses more than four slots at the database", async () => {
    const user = newUser();
    await getDb().insert(searchPreferences).values({ userId: user, ...defaultSearchPreferences() });
    await expect(
      getDb().execute(
        sql`UPDATE search_preferences SET compare_slots = '[null,null,null,null,null]'::jsonb WHERE user_id = ${user}`
      )
    ).rejects.toThrow(/compare_slots_check/);
  });
});
