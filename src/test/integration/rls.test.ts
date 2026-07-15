import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { withUserDb } from "@/db/user-context";
import { jobs, companies } from "@/db/schema";

const runRls = process.env.RUN_RLS_INTEGRATION === "true";

describe.runIf(runRls)("RLS integration", () => {
  const userA = process.env.RLS_TEST_USER_A ?? randomUUID();
  const userB = process.env.RLS_TEST_USER_B ?? randomUUID();
  let jobId: string;
  let companyId: string;

  afterAll(async () => {
    if (!jobId) return;
    const db = getDb();
    await db.delete(jobs).where(eq(jobs.id, jobId));
    if (companyId) {
      await db.delete(companies).where(eq(companies.id, companyId));
    }
  });

  it("withUserDb sets JWT claims so users only see their own jobs", async () => {
    const db = getDb();

    const [company] = await db
      .insert(companies)
      .values({ name: `RLS Test Co ${Date.now()}` })
      .returning();
    companyId = company.id;

    const created = await withUserDb(userA, async (tx) => {
      const [job] = await tx
        .insert(jobs)
        .values({
          userId: userA,
          companyId: company.id,
          title: "RLS isolation test job",
          description: "Private job for RLS test",
          sourceType: "manual",
        })
        .returning();
      return job;
    });
    jobId = created.id;

    const visibleToA = await withUserDb(userA, async (tx) =>
      tx.query.jobs.findFirst({
        where: eq(jobs.id, jobId),
      })
    );
    expect(visibleToA?.id).toBe(jobId);

    const visibleToB = await withUserDb(userB, async (tx) =>
      tx.query.jobs.findFirst({
        where: eq(jobs.id, jobId),
      })
    );
    expect(visibleToB).toBeUndefined();
  });
});
