import { eq } from "drizzle-orm";
import {
  CRON_MATCH_CONCURRENCY,
  CRON_MAX_BOARDS_PER_RUN,
  CRON_MAX_NEW_JOBS_PER_RUN,
  pickLeastRecentlyPolledBoards,
} from "@/lib/cron-discover";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getDb } from "@/db/client";
import { savedBoards, searchPreferences } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import { pickCuratedBoards } from "@/modules/discovery/curated-boards";
import {
  aggregateDiscoverStats,
  pollBoardsForUser,
  pollCuratedBoardsForUser,
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
    const activeBoards = await db.query.savedBoards.findMany({
      where: eq(savedBoards.isActive, true),
    });
    const boards = pickLeastRecentlyPolledBoards(activeBoards, CRON_MAX_BOARDS_PER_RUN);

    const byUser = groupBoardsByUser(boards);
    let curatedUserIds: string[] = [];
    try {
      const optedIn = await db.query.searchPreferences.findMany({
        where: eq(searchPreferences.discoverCuratedBoards, true),
        columns: { userId: true },
      });
      curatedUserIds = optedIn.map((row) => row.userId);
    } catch (error) {
      console.error("[cron] curated discovery skipped; search preferences unavailable", error);
    }

    const userIds = new Set<string>([...byUser.keys(), ...curatedUserIds]);
    const allResults: Array<{ status: "success" | "error" }> = [];
    // Sequential on purpose: each user opens one transaction on the shared pool.
    // Parallel users would check out one connection per user.
    const totals = {
      newJobs: 0,
      skipped: 0,
      updated: 0,
      queuedForMatch: 0,
      matched: 0,
      filtered: 0,
    };
    const caps = { remainingNewJobs: CRON_MAX_NEW_JOBS_PER_RUN };

    for (const userId of userIds) {
      if (caps.remainingNewJobs <= 0) break;

      const userBoards = byUser.get(userId) ?? [];
      let queuedForMatch = 0;

      if (userBoards.length > 0) {
        const { results, stats } = await withUserDb(userId, (userDb) =>
          pollBoardsForUser(userDb, userId, userBoards, caps)
        );
        allResults.push(...results);
        totals.newJobs += stats.newJobs;
        totals.skipped += stats.skipped;
        totals.filtered += stats.filtered;
        queuedForMatch += stats.queuedForMatch;
      }

      if (curatedUserIds.includes(userId) && caps.remainingNewJobs > 0) {
        const curated = await withUserDb(userId, async (userDb) => {
          const saved = await userDb.query.savedBoards.findMany({
            where: eq(savedBoards.userId, userId),
            columns: { boardUrl: true },
          });
          const picks = pickCuratedBoards(saved.map((row) => row.boardUrl));
          if (picks.length === 0) {
            return { results: [], stats: { newJobs: 0, skipped: 0, updated: 0, queuedForMatch: 0, filtered: 0 } };
          }
          return pollCuratedBoardsForUser(userDb, userId, picks, caps);
        });
        allResults.push(...curated.results);
        totals.newJobs += curated.stats.newJobs;
        totals.skipped += curated.stats.skipped;
        totals.filtered += curated.stats.filtered;
        queuedForMatch += curated.stats.queuedForMatch;
      }

      if (queuedForMatch > 0) {
        const matchStats = await withUserDb(userId, (userDb) =>
          processMatchQueue(userDb, userId, {
            limit: queuedForMatch || CRON_MAX_NEW_JOBS_PER_RUN,
            concurrency: CRON_MATCH_CONCURRENCY,
          })
        );
        totals.matched += matchStats.processed;
      }
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
