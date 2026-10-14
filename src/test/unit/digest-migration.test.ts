import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0016_job_digests.sql"),
  "utf8"
);

describe("job digest migration", () => {
  it("stores the email toggle on search preferences and snapshots on an owner-scoped table", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS digest_emails_enabled boolean NOT NULL DEFAULT true");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS digest_last_sent_at timestamp");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS digest_last_generated_at timestamp");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS job_digests");
    expect(migration).toContain("ALTER TABLE job_digests ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE job_digests FROM anon");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE job_digests TO authenticated"
    );
    expect(migration).toContain('POLICY "Users own their job digests"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
  });

  it("wraps auth.uid() so it is evaluated once per statement", () => {
    const unwrapped = migration.replaceAll("(select auth.uid())", "");
    expect(migration).toContain("(select auth.uid())");
    expect(unwrapped).not.toContain("auth.uid()");
  });
});
