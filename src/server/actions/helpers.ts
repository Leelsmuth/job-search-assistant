import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { applications, jobs } from "@/db/schema";
import type * as schema from "@/db/schema";

export type Db = PostgresJsDatabase<typeof schema>;

export async function requireOwnedJob(db: Db, userId: string, jobId: string) {
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)),
  });
  if (!job) throw new Error("Job not found");
  return job;
}

export async function getApplicationForJob(db: Db, userId: string, jobId: string) {
  return db.query.applications.findFirst({
    where: and(eq(applications.jobId, jobId), eq(applications.userId, userId)),
  });
}

export async function resolveApplicationForJob(
  db: Db,
  userId: string,
  jobId: string,
  applicationId?: string
) {
  await requireOwnedJob(db, userId, jobId);

  if (applicationId) {
    const app = await db.query.applications.findFirst({
      where: and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    });
    if (!app) throw new Error("Application not found");
    assertApplicationMatchesJob(app.jobId, jobId);
    return app;
  }

  const existing = await getApplicationForJob(db, userId, jobId);
  if (existing) return existing;

  const [app] = await db
    .insert(applications)
    .values({
      userId,
      jobId,
      status: "reviewing",
      dateSaved: new Date(),
    })
    .returning();
  return app;
}

export function filterApplicationsForOwnedJobs<
  T extends { job: { userId: string } | null },
>(userId: string, rows: T[]): T[] {
  return rows.filter((row) => row.job?.userId === userId);
}

export function assertApplicationMatchesJob(applicationJobId: string, jobId: string) {
  if (applicationJobId !== jobId) {
    throw new Error("Application does not match this job");
  }
}
