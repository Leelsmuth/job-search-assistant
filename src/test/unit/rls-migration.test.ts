import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0010_rls_reference_tables.sql"),
  "utf8"
);

describe("reference table RLS migration", () => {
  it("enables RLS and denies the anon key on shared tables", () => {
    for (const table of ["companies", "job_sources", "company_job_sources"]) {
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`REVOKE ALL ON TABLE ${table} FROM anon`);
    }
    expect(migration).toContain(
      "REVOKE ALL ON TABLE company_job_sources FROM anon, authenticated"
    );
    expect(migration).toContain('POLICY "No API access to company job sources"');
    expect(migration).toContain("USING (false)");
  });

  it("lets the authenticated server role read and insert companies and job sources", () => {
    expect(migration).toContain("GRANT SELECT, INSERT ON TABLE companies TO authenticated");
    expect(migration).toContain("GRANT SELECT, INSERT ON TABLE job_sources TO authenticated");
    expect(migration).toContain('POLICY "Authenticated read companies"');
    expect(migration).toContain('POLICY "Authenticated insert job sources"');
    expect(migration).not.toContain("GRANT SELECT, INSERT ON TABLE company_job_sources");
  });

  it("wraps every auth.uid() call so it is evaluated once per statement", () => {
    const unwrapped = migration.replaceAll("(select auth.uid())", "");
    expect(migration).toContain("(select auth.uid())");
    expect(unwrapped).not.toContain("auth.uid()");
  });
});
