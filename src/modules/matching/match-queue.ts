import { and, eq, asc } from "drizzle-orm";
import { jobs } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { runAndSaveMatchAnalysisDb } from "@/modules/matching/save-match-analysis";
import { measureOperation } from "@/lib/performance/measure-operation";

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_LIMIT = 20;

export type MatchQueueStats = {
  processed: number;
  skipped: number;
  failed: number;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    const current = index++;
    if (current >= items.length) return;
    results[current] = await worker(items[current]);
    await runNext();
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    runNext()
  );
  await Promise.all(runners);
  return results;
}

export async function processMatchQueue(
  db: Db,
  userId: string,
  options?: { limit?: number; concurrency?: number }
): Promise<MatchQueueStats> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  return measureOperation(
    "matching.processQueue",
    async () => {
      const pending = await db.query.jobs.findMany({
        where: and(
          eq(jobs.userId, userId),
          eq(jobs.matchPipelineStatus, "match_pending")
        ),
        columns: { id: true },
        orderBy: [asc(jobs.dateDiscovered)],
        limit,
      });

      const stats: MatchQueueStats = { processed: 0, skipped: 0, failed: 0 };

      if (pending.length === 0) return stats;

      await mapWithConcurrency(pending, concurrency, async (job) => {
        try {
          await runAndSaveMatchAnalysisDb(db, userId, job.id);
          stats.processed++;
        } catch (error) {
          stats.failed++;
          console.error(
            `[match-queue] failed jobId=${job.id} userId=${userId}`,
            error
          );
          await db
            .update(jobs)
            .set({ matchPipelineStatus: "match_failed", updatedAt: new Date() })
            .where(eq(jobs.id, job.id));
        }
      });

      return stats;
    },
    { source: "matching" }
  );
}
