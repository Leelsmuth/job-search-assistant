import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSearchPreferences } from "@/modules/matching/search-preferences";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0017_curated_board_discovery.sql"),
  "utf8"
);
const vercel = JSON.parse(
  readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")
) as { crons: Array<{ path: string; schedule: string }> };

describe("curated discovery migration", () => {
  it("turns curated boards on and stores exclusions on the owner's preferences", () => {
    expect(defaultSearchPreferences().discoverCuratedBoards).toBe(true);
    expect(defaultSearchPreferences().excludedCuratedBoardUrls).toEqual([]);
    expect(migration).toContain("excluded_curated_board_urls");
    expect(migration).toContain("SET DEFAULT true");
    expect(migration).toContain("SET discover_curated_boards = true");
    expect(migration).toContain("ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE search_preferences FROM anon");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE search_preferences TO authenticated"
    );
    expect(migration).toContain('POLICY "Users own their search preferences"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
  });

  it("keeps the shared poll cursor off the public API", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS curated_board_poll_state");
    expect(migration).toContain("ALTER TABLE curated_board_poll_state ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE curated_board_poll_state FROM anon, authenticated"
    );
    expect(migration).toContain('POLICY "No API access to curated board poll state"');
    expect(migration).toContain("USING (false)");
    expect(migration).toContain("WITH CHECK (false)");
  });
});

function cronFields(schedule: string): string[] {
  return schedule.trim().split(/\s+/);
}

describe("hobby discovery cron", () => {
  it("keeps a single daily discover cron before the daily digest", () => {
    expect(vercel.crons.map((cron) => cron.path)).toEqual(["/api/cron/discover", "/api/cron/digest"]);
    for (const cron of vercel.crons) {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = cronFields(cron.schedule);
      expect(minute).toMatch(/^\d+$/);
      expect(hour).toMatch(/^\d+$/);
      expect(dayOfMonth).toBe("*");
      expect(month).toBe("*");
      expect(dayOfWeek).toBe("*");
    }
    const discoverHour = Number(cronFields(vercel.crons[0].schedule)[1]);
    const digestHour = Number(cronFields(vercel.crons[1].schedule)[1]);
    expect(discoverHour).toBeLessThan(digestHour);
  });
});
