import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0013_assisted_apply.sql"),
  "utf8"
);

describe("assisted apply migration", () => {
  it("adds the application profile and caches forms per job", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS application_profiles");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS job_application_forms");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS payload jsonb");
    expect(migration).toContain("DEFAULT 'Canadian citizen'");
    expect(migration).toContain("requires_sponsorship boolean NOT NULL DEFAULT false");
    expect(migration).toContain("DEFAULT 'Prefer not to say'");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });

  it("locks both tables to the signed-in user and denies the anon key", () => {
    expect(migration).toContain("ALTER TABLE application_profiles ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE job_application_forms ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE application_profiles FROM anon");
    expect(migration).toContain("REVOKE ALL ON TABLE job_application_forms FROM anon");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE application_profiles TO authenticated"
    );
    expect(migration).toContain('POLICY "Users own their application profile"');
    expect(migration).toContain('POLICY "Users own their job application forms"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
    expect(migration).toContain("job_id IN (SELECT id FROM jobs WHERE user_id = (select auth.uid()))");
  });

  it("wraps every auth.uid() call so it is evaluated once per statement", () => {
    const unwrapped = migration.replaceAll("(select auth.uid())", "");
    expect(migration).toContain("(select auth.uid())");
    expect(unwrapped).not.toContain("auth.uid()");
  });
});
