import {
  CRON_MAX_BOARDS_PER_RUN,
  CRON_BOARD_DELAY_MS,
  summarizeCronPollResults,
  sleep,
} from "@/lib/cron-discover";
import { verifyCronAuth } from "@/lib/cron-auth";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { savedBoards } from "@/db/schema";
import { detectBestAdapter } from "@/modules/ingestion";

export async function runCronDiscoverPoll(): Promise<{
  polled: number;
  succeeded: number;
  failed: number;
}> {
  const db = getDb();
  const boards = await db.query.savedBoards.findMany({
    where: eq(savedBoards.isActive, true),
    limit: CRON_MAX_BOARDS_PER_RUN,
  });

  const results: Array<{ status: "success" | "error" }> = [];

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    try {
      const adapter = await detectBestAdapter(board.boardUrl);
      await adapter.fetch(board.boardUrl);
      results.push({ status: "success" });

      await db
        .update(savedBoards)
        .set({ lastPolledAt: new Date() })
        .where(eq(savedBoards.id, board.id));
    } catch {
      results.push({ status: "error" });
    }

    if (i < boards.length - 1) {
      await sleep(CRON_BOARD_DELAY_MS);
    }
  }

  return summarizeCronPollResults(results);
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
