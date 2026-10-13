import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0011_search_preferences.sql"),
  "utf8"
);

describe("search preferences migration", () => {
  it("creates a per-user table and locks it to the signed-in user", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS search_preferences");
    expect(migration).toContain("ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE search_preferences FROM anon");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE search_preferences TO authenticated"
    );
    expect(migration).toContain('POLICY "Users own their search preferences"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
  });

  it("stores location class and frontend fit on jobs", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS location_eligibility text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS frontend_fit_score real");
    expect(migration).toContain("'remote_canada'");
    expect(migration).toContain("'remote_other'");
    expect(migration).toContain("'hybrid_gta'");
    expect(migration).toContain("'onsite_gta'");
    expect(migration).toContain("'out_of_area'");
    expect(migration).toContain("Toronto");
    expect(migration).toContain("Mississauga");
  });
});
