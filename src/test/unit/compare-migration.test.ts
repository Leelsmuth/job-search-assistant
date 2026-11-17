import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { searchPreferences } from "@/db/schema";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0025_compare_tray.sql"),
  "utf8"
);

describe("compare tray migration", () => {
  it("adds the tray and the ranking to search_preferences, safe to run twice", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS compare_slots jsonb NOT NULL DEFAULT '[]'::jsonb"
    );
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS compare_priorities jsonb;");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS search_preferences_compare_slots_check");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS search_preferences_compare_priorities_check");
  });

  it("caps the tray at four slots", () => {
    expect(migration).toContain("jsonb_array_length(compare_slots) <= 4");
  });

  it("relies on the existing per-user policy instead of opening anything new", () => {
    expect(migration).toContain('"Users own their search preferences"');
    expect(migration).not.toMatch(/GRANT|CREATE POLICY|DISABLE ROW LEVEL SECURITY/i);
  });

  it("matches the Drizzle schema", () => {
    const columns = new Map(getTableConfig(searchPreferences).columns.map((column) => [column.name, column]));
    expect(columns.get("compare_slots")?.notNull).toBe(true);
    expect(columns.get("compare_slots")?.getSQLType()).toBe("jsonb");
    expect(columns.get("compare_priorities")?.notNull).toBe(false);
    expect(columns.get("compare_priorities")?.getSQLType()).toBe("jsonb");
  });
});
