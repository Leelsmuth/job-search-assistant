import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverBatchUrl,
  kickDiscoverBatch,
  parseDiscoverContinuation,
} from "@/lib/cron-discover-kick";

describe("discover batch kick", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("builds an authenticated continuation URL", () => {
    const url = discoverBatchUrl("https://jobs.example", {
      cursor: 4,
      hop: 2,
      runStartedAt: "2026-10-15T08:00:00.000Z",
    });
    expect(url).toBe(
      "https://jobs.example/api/cron/discover?cursor=4&hop=2&runStartedAt=2026-10-15T08%3A00%3A00.000Z"
    );
    expect(parseDiscoverContinuation(new URL(url))).toEqual({
      cursor: 4,
      hop: 2,
      runStartedAt: "2026-10-15T08:00:00.000Z",
    });
  });

  it("sends the cron secret and does not follow a failed response quietly", async () => {
    process.env.CRON_SECRET = "test-secret";
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await kickDiscoverBatch(
      { cursor: 1, hop: 1, runStartedAt: "2026-10-15T08:00:00.000Z" },
      fetchImpl
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/cron/discover?"),
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
      })
    );
  });
});
