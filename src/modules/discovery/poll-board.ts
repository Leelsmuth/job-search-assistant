import { eq } from "drizzle-orm";
import { savedBoards } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import {
  detectBestAdapter,
  getAdapterForProvider,
} from "@/modules/ingestion/adapters";
import type { JobSourceProvider } from "@/modules/ingestion/types";
import { normalizeBoardJobs } from "@/modules/ingestion/board-normalize";
import { persistDiscoveredJob } from "@/modules/ingestion/persist-job";
import { runAndSaveMatchAnalysisDb } from "@/modules/matching/save-match-analysis";
import {
  CRON_BOARD_DELAY_MS,
  CRON_MAX_NEW_JOBS_PER_RUN,
  sleep,
  type CronDiscoverResult,
} from "@/lib/cron-discover";

export type BoardPollStats = {
  newJobs: number;
  skipped: number;
  matched: number;
};

export async function pollSavedBoard(
  db: Db,
  userId: string,
  board: {
    id: string;
    boardUrl: string;
    provider: JobSourceProvider;
    companyName: string;
  },
  caps: { remainingNewJobs: number }
): Promise<BoardPollStats> {
  const stats: BoardPollStats = { newJobs: 0, skipped: 0, matched: 0 };

  const adapter =
    getAdapterForProvider(board.provider) ?? (await detectBestAdapter(board.boardUrl));
  const raw = await adapter.fetch(board.boardUrl);
  const normalizedJobs = normalizeBoardJobs(raw);

  for (const job of normalizedJobs) {
    if (caps.remainingNewJobs <= 0) break;

    const result = await persistDiscoveredJob(db, userId, job, {
      provider: board.provider,
      sourceUrl: job.jobUrl || board.boardUrl,
      sourceJobId: job.sourceJobId,
    });

    if (!result.isNew) {
      stats.skipped++;
      continue;
    }

    stats.newJobs++;
    caps.remainingNewJobs--;

    await runAndSaveMatchAnalysisDb(db, userId, result.jobId);
    stats.matched++;
  }

  await db
    .update(savedBoards)
    .set({ lastPolledAt: new Date() })
    .where(eq(savedBoards.id, board.id));

  return stats;
}

export async function pollBoardsForUser(
  db: Db,
  userId: string,
  boards: Array<{
    id: string;
    boardUrl: string;
    provider: JobSourceProvider;
    companyName: string;
  }>,
  globalCaps: { remainingNewJobs: number }
): Promise<{
  results: Array<{ boardId: string; status: "success" | "error" }>;
  stats: BoardPollStats;
}> {
  const stats: BoardPollStats = { newJobs: 0, skipped: 0, matched: 0 };
  const results: Array<{ boardId: string; status: "success" | "error" }> = [];

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    try {
      const boardStats = await pollSavedBoard(db, userId, board, globalCaps);
      stats.newJobs += boardStats.newJobs;
      stats.skipped += boardStats.skipped;
      stats.matched += boardStats.matched;
      results.push({ boardId: board.id, status: "success" });
    } catch (error) {
      console.error(
        `[discovery] board poll failed userId=${userId} boardId=${board.id}`,
        error
      );
      results.push({ boardId: board.id, status: "error" });
    }

    if (i < boards.length - 1) {
      await sleep(CRON_BOARD_DELAY_MS);
    }
  }

  return { results, stats };
}

export function aggregateDiscoverStats(
  boardResults: Array<{ status: "success" | "error" }>,
  stats: BoardPollStats
): CronDiscoverResult {
  const succeeded = boardResults.filter((r) => r.status === "success").length;
  return {
    polled: boardResults.length,
    succeeded,
    failed: boardResults.length - succeeded,
    newJobs: stats.newJobs,
    skipped: stats.skipped,
    matched: stats.matched,
  };
}

export { CRON_MAX_NEW_JOBS_PER_RUN };
