export const CRON_MAX_BOARDS_PER_RUN = 20;
/** One match at a time. The cron runs inside a single pooled connection. */
export const CRON_MATCH_CONCURRENCY = 1;
export const CRON_BOARD_DELAY_MS = 500;
export const CRON_MAX_NEW_JOBS_PER_RUN = Number(
  process.env.CRON_MAX_NEW_JOBS_PER_RUN ?? 50
);

export type CronPollResult = {
  polled: number;
  succeeded: number;
  failed: number;
};

export type CronDiscoverResult = CronPollResult & {
  newJobs: number;
  skipped: number;
  matched: number;
  filtered: number;
};

export function summarizeCronPollResults(
  results: Array<{ status: "success" | "error" }>
): CronPollResult {
  const succeeded = results.filter((r) => r.status === "success").length;
  return {
    polled: results.length,
    succeeded,
    failed: results.length - succeeded,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pollRecency(value: Date | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = value.getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** Never-polled boards come first, then the oldest lastPolledAt. */
export function pickLeastRecentlyPolledBoards<T extends { lastPolledAt: Date | null }>(
  boards: readonly T[],
  limit: number
): T[] {
  return boards
    .map((board, index) => ({ board, index }))
    .sort((a, b) => {
      const delta = pollRecency(a.board.lastPolledAt) - pollRecency(b.board.lastPolledAt);
      if (delta !== 0) return delta;
      return a.index - b.index;
    })
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.board);
}
