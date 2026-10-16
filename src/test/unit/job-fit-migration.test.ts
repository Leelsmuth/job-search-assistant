import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSearchPreferences } from "@/modules/matching/search-preferences";

const migration = readFileSync(resolve(process.cwd(), "drizzle/migrations/0018_job_fit.sql"), "utf8");

describe("job fit migration", () => {
  it("adds fit columns and thresholds with owner policies", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS fit_score real");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS fit_breakdown jsonb");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS fit_eligible boolean");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS fit_ineligible_reason text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS min_fit_to_show integer NOT NULL DEFAULT 50");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS digest_min_fit integer NOT NULL DEFAULT 55");
    expect(migration).toContain("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE jobs FROM anon");
    expect(migration).toContain("REVOKE ALL ON TABLE search_preferences FROM anon");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE jobs TO authenticated");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE search_preferences TO authenticated"
    );
    expect(migration).toContain('POLICY "Users own their jobs"');
    expect(migration).toContain('POLICY "Users own their search preferences"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
  });

  it("syncs salary and titles without deleting jobs", () => {
    expect(migration).toContain("minimum_salary_cad = profile.minimum_salary");
    expect(migration).toContain("target_titles = prefs.target_titles");
    expect(migration.toLowerCase()).not.toContain("delete from jobs");
    expect(defaultSearchPreferences().minFitToShow).toBe(50);
    expect(defaultSearchPreferences().digestMinFit).toBe(55);
  });
});
