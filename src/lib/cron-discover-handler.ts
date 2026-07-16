import { eq } from "drizzle-orm";
import { CRON_MAX_BOARDS_PER_RUN, CRON_MAX_NEW_JOBS_PER_RUN } from "@/lib/cron-discover";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getDb } from "@/db/client";
import { savedBoards } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import {
  aggregateDiscoverStats,
  pollBoardsForUser,
} from "@/modules/discovery/poll-board";
import { processMatchQueue } from "@/modules/matching/match-queue";
import type { JobSourceProvider } from "@/modules/ingestion/types";
import { runWithPerfContextAsync } from "@/lib/performance/request-context";

function groupBoardsByUser(
  boards: Array<{
    id: string;
    userId: string;
    boardUrl: string;
    provider: JobSourceProvider;
    companyName: string;
  }>
) {
  const map = new Map<string, typeof boards>();
  for (const board of boards) {
    const list = map.get(board.userId) ?? [];
    list.push(board);
    map.set(board.userId, list);
  }
  return map;
}

export async function runCronDiscoverPoll() {
  return runWithPerfContextAsync("cron.discover", async () => {
    const db = getDb();
    const boards = await db.query.savedBoards.findMany({
      where: eq(savedBoards.isActive, true),
      limit: CRON_MAX_BOARDS_PER_RUN,
    });

    const byUser = groupBoardsByUser(boards);
    const allResults: Array<{ status: "success" | "error" }> = [];
    const totals = {
      newJobs: 0,
      skipped: 0,
      updated: 0,
      queuedForMatch: 0,
      matched: 0,
      filtered: 0,
    };
    const caps = { remainingNewJobs: CRON_MAX_NEW_JOBS_PER_RUN };

    for (const [userId, userBoards] of byUser) {
      if (caps.remainingNewJobs <= 0) break;

      const { results, stats } = await withUserDb(userId, (userDb) =>
        pollBoardsForUser(userDb, userId, userBoards, caps)
      );

      const matchStats = await withUserDb(userId, (userDb) =>
        processMatchQueue(userDb, userId, {
          limit: stats.queuedForMatch || CRON_MAX_NEW_JOBS_PER_RUN,
        })
      );

      allResults.push(...results);
      totals.newJobs += stats.newJobs;
      totals.skipped += stats.skipped;
      totals.matched += matchStats.processed;
      totals.filtered += stats.filtered;
    }

    return aggregateDiscoverStats(allResults, totals);
  });
}

export async function handleCronDiscoverRequest(
  authHeader: string | null
): Promise<{ status: number; body: Record<string, unknown> }> {
  const auth = verifyCronAuth(authHeader);
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  const summary = await runCronDiscoverPoll();
  return { status: 200, body: summary };
}
