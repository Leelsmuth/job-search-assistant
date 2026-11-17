import { describe, expect, it } from "vitest";
import type { Db } from "@/server/actions/helpers";
import {
  CompareStorageUnavailableError,
  isJobId,
  loadCompareState,
  saveComparePriorities,
} from "@/modules/compare/compare-db";

/** Postgres' answer when a column does not exist (migration 0025 not applied). */
function missingColumn(column: string) {
  return Object.assign(new Error(`column "${column}" does not exist`), { code: "42703" });
}

/** Just enough of a database for these calls, failing the way an unmigrated one does. */
function unmigratedDb(): Db {
  const fail = () => {
    throw missingColumn("compare_slots");
  };
  return {
    query: { searchPreferences: { findFirst: async () => fail() } },
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => fail() }) }),
  } as unknown as Db;
}

describe("compare storage before migration 0025", () => {
  it("loads an empty tray on the suggested order, marked as not saved", async () => {
    const state = await loadCompareState(unmigratedDb(), "user");
    expect(state).toEqual({
      slots: [null, null, null, null],
      roles: [],
      priorities: { order: ["fit", "location", "salary", "remote", "freshness"], saved: false },
      available: false,
    });
  });

  it("reports saves as unavailable rather than failing with a database error", async () => {
    await expect(saveComparePriorities(unmigratedDb(), "user", ["salary"])).rejects.toBeInstanceOf(
      CompareStorageUnavailableError
    );
  });

  it("does not swallow other database errors", async () => {
    const db = {
      query: {
        searchPreferences: {
          findFirst: async () => {
            throw new Error("connection reset");
          },
        },
      },
    } as unknown as Db;
    await expect(loadCompareState(db, "user")).rejects.toThrow("connection reset");
  });
});

describe("isJobId", () => {
  it("accepts uuids only, so nothing else reaches a query", () => {
    expect(isJobId("0b0b0b0b-0000-4000-8000-000000000001")).toBe(true);
    expect(isJobId("northwind-senior-frontend")).toBe(false);
    expect(isJobId("'; drop table jobs; --")).toBe(false);
  });
});
