import { describe, expect, it } from "vitest";
import { selectDigestJobs } from "@/modules/digest/select";
import type { DigestJobSource } from "@/modules/digest/types";
import { freshnessBonus, freshnessRankScore, FRESHNESS_BONUS_MAX } from "@/modules/matching/freshness";
import { defaultSearchPreferences } from "@/modules/matching/search-preferences";

const NOW = new Date("2026-10-16T15:00:00.000Z");
const VISIBILITY = defaultSearchPreferences();

function job(overrides: Partial<DigestJobSource> & Pick<DigestJobSource, "id">): DigestJobSource {
  return {
    title: "Frontend Engineer",
    companyName: "Acme",
    location: "Remote - Canada",
    workplaceType: "remote",
    jobUrl: "https://example.com/jobs/1",
    dateDiscovered: new Date("2026-10-10T00:00:00.000Z"),
    status: "active",
    locationEligibility: "remote_canada",
    frontendFitScore: 80,
    frontendFitReasons: ["Title is a frontend or UI engineering role"],
    fitScore: 80,
    fitEligible: true,
    ...overrides,
  };
}

describe("freshness ranking", () => {
  it("adds a small decaying bonus that cannot outrank a clearly better fit", () => {
    const fresh = new Date("2026-10-16T14:00:00.000Z");
    const old = new Date("2026-10-01T00:00:00.000Z");
    expect(freshnessBonus(fresh, NOW)).toBeGreaterThan(2);
    expect(freshnessBonus(old, NOW)).toBe(0);
    expect(freshnessBonus(fresh, NOW)).toBeLessThanOrEqual(FRESHNESS_BONUS_MAX);
    expect(freshnessRankScore(70, fresh, NOW)).toBeLessThan(freshnessRankScore(80, old, NOW));
    expect(freshnessRankScore(80, fresh, NOW)).toBeGreaterThan(freshnessRankScore(80, old, NOW));
  });

  it("reorders similar digest matches by recency without admitting jobs under the cutoff", () => {
    const selected = selectDigestJobs({
      now: NOW,
      minScore: 55,
      visibility: VISIBILITY,
      gtaCities: VISIBILITY.gtaCities,
      profile: {},
      jobs: [
        job({ id: "older", fitScore: 80, postedAt: new Date("2026-10-01T00:00:00.000Z") }),
        job({ id: "newer", fitScore: 80, postedAt: new Date("2026-10-16T14:00:00.000Z") }),
        job({ id: "better", fitScore: 90, postedAt: new Date("2026-10-01T00:00:00.000Z") }),
        job({
          id: "fresh-low",
          fitScore: 40,
          postedAt: new Date("2026-10-16T14:30:00.000Z"),
        }),
        job({ id: "blocked", fitScore: 99, fitEligible: false, postedAt: new Date("2026-10-16T14:30:00.000Z") }),
      ],
    });
    expect(selected.map((item) => item.id)).toEqual(["better", "newer", "older"]);
  });
});
