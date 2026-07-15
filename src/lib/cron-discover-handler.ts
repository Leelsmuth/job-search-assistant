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
import type { JobSourceProvider } from "@/modules/ingestion/types";

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
  const db = getDb();
  const boards = await db.query.savedBoards.findMany({
    where: eq(savedBoards.isActive, true),
    limit: CRON_MAX_BOARDS_PER_RUN,
  });

  const byUser = groupBoardsByUser(boards);
  const allResults: Array<{ status: "success" | "error" }> = [];
  const totals = { newJobs: 0, skipped: 0, matched: 0 };
  const caps = { remainingNewJobs: CRON_MAX_NEW_JOBS_PER_RUN };

  for (const [userId, userBoards] of byUser) {
    if (caps.remainingNewJobs <= 0) break;

    const { results, stats } = await withUserDb(userId, (userDb) =>
      pollBoardsForUser(userDb, userId, userBoards, caps)
    );

    allResults.push(...results);
    totals.newJobs += stats.newJobs;
    totals.skipped += stats.skipped;
    totals.matched += stats.matched;
  }

  return aggregateDiscoverStats(allResults, totals);
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
