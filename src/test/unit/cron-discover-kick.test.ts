import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const execute = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  getDb: () => ({ execute }),
}));

import {
  discoverBatchUrl,
  kickDiscoverBatch,
  parseDiscoverContinuation,
} from "@/lib/cron-discover-kick";

const dialect = new PgDialect();

describe("discover batch kick", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalVercel = process.env.VERCEL;
  const originalBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalBypass === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = originalBypass;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    execute.mockReset();
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
    delete process.env.VERCEL;
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
        headers: { Authorization: "Bearer test-secret" },
      })
    );
  });

  it("queues the next hop through pg_net on Vercel instead of fetching itself", async () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_APP_URL = "https://jobs.example";
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    execute.mockResolvedValue([]);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 508 });

    await kickDiscoverBatch(
      { cursor: 4, hop: 2, runStartedAt: "2026-10-16T08:00:00.000Z" },
      fetchImpl
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    const query = dialect.sqlToQuery(execute.mock.calls[0][0] as SQL);
    expect(query.sql).toContain("net.http_post");
    expect(query.params).toContain(
      "https://jobs.example/api/cron/discover?cursor=4&hop=2&runStartedAt=2026-10-16T08%3A00%3A00.000Z"
    );
    expect(query.params).toContain("Bearer test-secret");
  });

  it("does not report a 508 or leak the cron secret when the queue fails", async () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_APP_URL = "https://jobs.example";
    execute.mockRejectedValue(new Error("net.http_post failed for Bearer test-secret"));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 508 });

    await expect(
      kickDiscoverBatch(
        { cursor: 1, hop: 1, runStartedAt: "2026-10-16T08:00:00.000Z" },
        fetchImpl
      )
    ).rejects.toThrow(/could not be queued/i);

    await expect(
      kickDiscoverBatch(
        { cursor: 1, hop: 1, runStartedAt: "2026-10-16T08:00:00.000Z" },
        fetchImpl
      )
    ).rejects.not.toThrow(/test-secret|508/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
