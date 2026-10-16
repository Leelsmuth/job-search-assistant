import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const execute = vi.hoisted(() => vi.fn());
const findSavedBoards = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  getDb: () => ({
    execute,
    query: {
      savedBoards: { findMany: findSavedBoards },
    },
  }),
}));

import { runDiscoveryTick } from "@/lib/discovery-tick";

const NOW = new Date("2026-10-16T23:30:00.000Z");
const dialect = new PgDialect();

function queryParams(query: SQL): unknown[] {
  return dialect.sqlToQuery(query).params;
}

describe("discovery tick lease", () => {
  beforeEach(() => {
    execute.mockReset();
    findSavedBoards.mockReset();
    execute.mockResolvedValue([{ cursor: 0 }]);
    findSavedBoards.mockRejectedValue(new Error("saved boards unavailable"));
  });

  it("binds lease timestamps as strings and logs the underlying error", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runDiscoveryTick({ now: NOW, budgetMs: 1_000 });

    expect(result).toMatchObject({ ok: false, polled: 0, newJobs: 0, cursor: 0, reason: "failed" });
    expect(execute.mock.calls.length).toBeGreaterThan(0);
    const acquireParams = queryParams(execute.mock.calls[0][0] as SQL);
    expect(acquireParams).toContain(NOW.toISOString());
    for (const [query] of execute.mock.calls) {
      const params = queryParams(query as SQL);
      expect(params.some((value) => value instanceof Date)).toBe(false);
      expect(params.every((value) => typeof value === "string" || typeof value === "number")).toBe(true);
    }
    expect(errorLog).toHaveBeenCalledWith("[discovery-tick] failed: saved boards unavailable");
    errorLog.mockRestore();
  });
});
