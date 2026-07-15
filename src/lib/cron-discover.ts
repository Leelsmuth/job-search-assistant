export const CRON_MAX_BOARDS_PER_RUN = 20;
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
