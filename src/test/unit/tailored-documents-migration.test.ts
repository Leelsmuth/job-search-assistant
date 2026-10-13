import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0012_tailored_documents.sql"),
  "utf8"
);

describe("tailored documents migration", () => {
  it("adds resume version fields without dropping existing data", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS job_id");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS content_json");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS generation_mode");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });

  it("stores cover letters per user and denies the anon key", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS cover_letters");
    expect(migration).toContain("ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE cover_letters FROM anon");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cover_letters TO authenticated"
    );
    expect(migration).toContain('POLICY "Users own their cover letters"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK");
  });

  it("wraps every auth.uid() call so it is evaluated once per statement", () => {
    const unwrapped = migration.replaceAll("(select auth.uid())", "");
    expect(migration).toContain("(select auth.uid())");
    expect(unwrapped).not.toContain("auth.uid()");
  });
});
