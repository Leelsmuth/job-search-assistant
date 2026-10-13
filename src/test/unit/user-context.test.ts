import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, root } = vi.hoisted(() => {
  const tx = {
    execute: vi.fn(async () => undefined),
  };
  const root = {
    transaction: vi.fn(async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { tx, root };
});

vi.mock("@/db/client", () => ({
  getDb: () => root,
  DB_STATEMENT_TIMEOUT_MS: 20_000,
  DB_LOCK_TIMEOUT_MS: 10_000,
}));

import { withUserDb } from "@/db/user-context";

describe("withUserDb", () => {
  beforeEach(() => {
    tx.execute.mockClear();
    root.transaction.mockClear();
  });

  it("sets the request role inside the transaction before user queries run", async () => {
    let sawRole = false;

    const result = await withUserDb("user-1", async (db) => {
      expect(db).toBe(tx);
      const sqlText = JSON.stringify(tx.execute.mock.calls);
      sawRole = sqlText.includes("SET LOCAL ROLE");
      expect(sqlText).toContain("set_config");
      expect(sqlText).toContain("statement_timeout");
      expect(sqlText.indexOf("statement_timeout")).toBeLessThan(sqlText.indexOf("SET LOCAL ROLE"));
      expect(sqlText).not.toContain("SET ROLE authenticated");
      return "ok";
    });

    expect(result).toBe("ok");
    expect(root.transaction).toHaveBeenCalledTimes(1);
    expect(sawRole).toBe(true);
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });
});
