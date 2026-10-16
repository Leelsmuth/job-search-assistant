import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0022_resume_job_scores.sql"),
  "utf8"
);
const actions = readFileSync(resolve(process.cwd(), "src/server/actions/resume-score-actions.ts"), "utf8");
const load = readFileSync(resolve(process.cwd(), "src/modules/resume-score/load.ts"), "utf8");
const store = readFileSync(resolve(process.cwd(), "src/modules/resume-score/store.ts"), "utf8");

describe("resume job score migration", () => {
  it("creates the score table with owner policies and tells reviewers to apply it", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS resume_job_scores");
    expect(migration).toContain("ALTER TABLE resume_job_scores ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE resume_job_scores FROM anon");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE resume_job_scores TO authenticated");
    expect(migration).toContain('POLICY "Users own their resume job scores"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
    expect(migration).toContain("BEFORE merging");
    expect(migration.toLowerCase()).not.toContain("delete from jobs");
  });
});

describe("resume score database access", () => {
  it("keeps user queries sequential and exports only async actions", () => {
    expect(actions.startsWith('"use server"')).toBe(true);
    expect(actions).not.toContain("Promise.all");
    expect(load).not.toContain("Promise.all");
    expect(store).not.toContain("Promise.all");
    expect(actions).not.toMatch(/export function /);
    expect(actions).not.toMatch(/export const /);
    expect(actions).toContain("export async function getResumeMatch");
    expect(actions).toContain("export async function generateResumeMatchSuggestions");
    expect(actions).toContain("export async function applyResumeMatchSuggestions");
  });
});
