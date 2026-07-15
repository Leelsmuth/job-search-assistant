import { describe, it, expect } from "vitest";
import { isAnalysisStale, MATCH_ANALYSIS_VERSION } from "@/modules/matching/stale";

describe("isAnalysisStale", () => {
  it("returns false when profile was not updated after analysis", () => {
    expect(
      isAnalysisStale("2026-01-15T10:00:00Z", "2026-01-10T10:00:00Z")
    ).toBe(false);
  });

  it("returns true when profile updated after analysis", () => {
    expect(
      isAnalysisStale("2026-01-10T10:00:00Z", "2026-01-15T10:00:00Z")
    ).toBe(true);
  });

  it("returns false when profile updatedAt is missing", () => {
    expect(isAnalysisStale("2026-01-10T10:00:00Z", null)).toBe(false);
  });

  it("uses current match analysis version", () => {
    expect(MATCH_ANALYSIS_VERSION).toBe("v2");
  });
});
