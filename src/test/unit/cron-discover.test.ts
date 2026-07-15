import { describe, it, expect } from "vitest";
import {
  summarizeCronPollResults,
  CRON_MAX_BOARDS_PER_RUN,
  CRON_MAX_NEW_JOBS_PER_RUN,
} from "@/lib/cron-discover";
import { aggregateDiscoverStats } from "@/modules/discovery/poll-board";

describe("cron discover helpers", () => {
  it("summarizes poll results", () => {
    expect(
      summarizeCronPollResults([
        { status: "success" },
        { status: "error" },
        { status: "success" },
      ])
    ).toEqual({ polled: 3, succeeded: 2, failed: 1 });
  });

  it("exports board cap constant", () => {
    expect(CRON_MAX_BOARDS_PER_RUN).toBeGreaterThan(0);
  });

  it("exports new jobs cap constant", () => {
    expect(CRON_MAX_NEW_JOBS_PER_RUN).toBeGreaterThan(0);
  });

  it("aggregates discovery stats", () => {
    expect(
      aggregateDiscoverStats(
        [{ status: "success" }, { status: "error" }],
        { newJobs: 5, skipped: 10, matched: 5, filtered: 20 }
      )
    ).toEqual({
      polled: 2,
      succeeded: 1,
      failed: 1,
      newJobs: 5,
      skipped: 10,
      matched: 5,
      filtered: 20,
    });
  });
});
