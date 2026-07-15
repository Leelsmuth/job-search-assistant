import { describe, it, expect } from "vitest";
import {
  summarizeCronPollResults,
  CRON_MAX_BOARDS_PER_RUN,
} from "@/lib/cron-discover";

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
});
