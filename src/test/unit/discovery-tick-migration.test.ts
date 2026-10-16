import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0023_discovery_tick_and_alerts.sql"),
  "utf8"
);

describe("discovery tick migration", () => {
  it("adds posting age, alerts, the tick lease, and a vault-backed schedule", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS posted_at timestamp");
    expect(migration).toContain("posted_at_source IN ('provider', 'first_seen')");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS job_alerts");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS profile_rescore_queue");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS discovery_tick_lock");
    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("discovery_tick_url");
    expect(migration).toContain("discovery_tick_secret");
    expect(migration).toContain("cron.schedule");
    expect(migration).toContain("'*/30 * * * *'");
    expect(migration).toContain('POLICY "Users own their job alerts"');
    expect(migration).toContain('POLICY "Users own their rescore queue"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
    expect(migration).toContain('POLICY "No API access to discovery tick lock"');
    expect(migration).not.toMatch(/Bearer [A-Za-z0-9+/=]{16,}/);
  });
});
