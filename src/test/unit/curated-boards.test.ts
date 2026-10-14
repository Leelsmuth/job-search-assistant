import { describe, expect, it } from "vitest";
import { CURATED_CANADA_BOARDS, pickCuratedBoards } from "@/modules/discovery/curated-boards";
import { normalizeBoardUrl } from "@/modules/ingestion/board-url";

describe("pickCuratedBoards", () => {
  it("rotates a small slice and skips boards the user already saved", () => {
    const saved = CURATED_CANADA_BOARDS.slice(0, 2).map((board) => `${board.boardUrl}/`);
    const first = pickCuratedBoards(saved, 2, new Date("2026-01-01T00:00:00.000Z"));
    const later = pickCuratedBoards(saved, 2, new Date("2026-01-03T00:00:00.000Z"));

    expect(first).toHaveLength(2);
    expect(first.every((board) => !saved.some((url) => url.startsWith(board.boardUrl)))).toBe(true);
    expect(later[0]?.boardUrl).not.toBe(first[0]?.boardUrl);
    expect(CURATED_CANADA_BOARDS.every((board) => board.boardUrl.startsWith("https://"))).toBe(true);
    expect(new Set(CURATED_CANADA_BOARDS.map((board) => board.boardUrl)).size).toBe(
      CURATED_CANADA_BOARDS.length
    );
  });

  it("includes verified Canadian Workday boards", () => {
    const workday = CURATED_CANADA_BOARDS.filter((board) => board.provider === "workday");
    expect(workday.map((board) => board.companyName)).toEqual([
      "RBC",
      "TD",
      "CIBC",
      "BMO",
      "Manulife",
      "Sun Life",
      "Thomson Reuters",
    ]);
    for (const board of workday) {
      expect(normalizeBoardUrl(board.boardUrl, "workday").provider).toBe("workday");
    }
  });
});
