import { and, asc, eq, ne } from "drizzle-orm";
import { jobs, profileRescoreQueue } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { withUserDb } from "@/db/user-context";
import { runAndSaveMatchAnalysisDb } from "@/modules/matching/save-match-analysis";

const BATCH_LIMIT = 40;
const BATCH_BUDGET_MS = 25_000;

export async function queueProfileRescore(db: Db, userId: string): Promise<number> {
  const active = await db.query.jobs.findMany({
    where: and(eq(jobs.userId, userId), ne(jobs.status, "dismissed")),
    columns: { id: true },
  });
  if (active.length === 0) return 0;
  await db
    .insert(profileRescoreQueue)
    .values(active.map((job) => ({ userId, jobId: job.id })))
    .onConflictDoNothing();
  return active.length;
}

/** Rescore queued jobs one at a time so a profile change clears "Needs rescore". */
export async function drainProfileRescore(
  userId: string,
  options?: { limit?: number; budgetMs?: number }
): Promise<number> {
  const limit = options?.limit ?? BATCH_LIMIT;
  const budgetMs = options?.budgetMs ?? BATCH_BUDGET_MS;
  const started = Date.now();
  let done = 0;

  while (done < limit && Date.now() - started < budgetMs) {
    const nextId = await withUserDb(userId, async (db) => {
      const row = await db.query.profileRescoreQueue.findFirst({
        where: eq(profileRescoreQueue.userId, userId),
        orderBy: [asc(profileRescoreQueue.queuedAt)],
        columns: { jobId: true },
      });
      return row?.jobId ?? null;
    });
    if (!nextId) break;

    try {
      await withUserDb(userId, async (db) => {
        await runAndSaveMatchAnalysisDb(db, userId, nextId, undefined, { force: true });
        await db
          .delete(profileRescoreQueue)
          .where(and(eq(profileRescoreQueue.userId, userId), eq(profileRescoreQueue.jobId, nextId)));
      });
    } catch (error) {
      console.error(`[rescore] job ${nextId} failed`, error);
      await withUserDb(userId, (db) =>
        db
          .update(profileRescoreQueue)
          .set({ queuedAt: new Date() })
          .where(and(eq(profileRescoreQueue.userId, userId), eq(profileRescoreQueue.jobId, nextId)))
      );
    }
    done += 1;
  }

  return done;
}
