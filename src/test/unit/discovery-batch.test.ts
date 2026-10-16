import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISCOVER_BATCH_BUDGET_MS,
  FAST_BOARD_ESTIMATE_MS,
  WORKDAY_BOARD_ESTIMATE_MS,
} from "@/lib/cron-discover";
import { CURATED_CANADA_BOARDS } from "@/modules/discovery/curated-boards";
import {
  buildDiscoveryTargets,
  estimateTargetMs,
  savedTargetsWithinCap,
  selectDiscoveryBatch,
  type DiscoveryTarget,
} from "@/modules/discovery/discovery-batch";

const NOW = new Date("2026-10-15T08:00:00.000Z");

function target(
  partial: Partial<DiscoveryTarget> & Pick<DiscoveryTarget, "key" | "provider">
): DiscoveryTarget {
  return {
    boardUrl: `https://boards.example/${partial.key}`,
    companyName: partial.key,
    origin: "curated",
    recipients: [{ userId: "user-1", savedBoardId: null }],
    lastPolledAt: null,
    ...partial,
  };
}

describe("discovery batch planning", () => {
  it("polls a curated board once and dedupes a saved copy of the same URL", () => {
    const curated = CURATED_CANADA_BOARDS[0];
    const { savedTargets, curatedTargets } = buildDiscoveryTargets({
      curatedBoards: [curated],
      savedBoards: [
        {
          id: "saved-1",
          userId: "user-1",
          boardUrl: `${curated.boardUrl}/`,
          provider: curated.provider,
          companyName: curated.companyName,
          isActive: true,
          lastPolledAt: null,
        },
      ],
      users: [
        { userId: "user-1", includeCurated: true, excludedCuratedBoardUrls: [] },
        { userId: "user-2", includeCurated: true, excludedCuratedBoardUrls: [] },
      ],
    });

    expect(savedTargets).toEqual([]);
    expect(curatedTargets).toHaveLength(1);
    expect(curatedTargets[0]?.recipients).toEqual([
      { userId: "user-1", savedBoardId: "saved-1" },
      { userId: "user-2", savedBoardId: null },
    ]);
  });

  it("includes curated boards by default and still polls a followed board that was excluded", () => {
    const [first, second] = CURATED_CANADA_BOARDS;
    const { curatedTargets } = buildDiscoveryTargets({
      curatedBoards: [first, second],
      savedBoards: [
        {
          id: "saved-2",
          userId: "user-1",
          boardUrl: second.boardUrl,
          provider: second.provider,
          companyName: second.companyName,
          isActive: true,
          lastPolledAt: null,
        },
      ],
      users: [
        {
          userId: "user-1",
          includeCurated: true,
          excludedCuratedBoardUrls: [first.boardUrl, second.boardUrl],
        },
      ],
    });

    expect(curatedTargets.map((board) => board.companyName)).toEqual([second.companyName]);
    expect(curatedTargets[0]?.recipients).toEqual([{ userId: "user-1", savedBoardId: "saved-2" }]);
  });

  it("skips curated boards when the user turns the setting off, except boards they follow", () => {
    const [first, second] = CURATED_CANADA_BOARDS;
    const { curatedTargets, savedTargets } = buildDiscoveryTargets({
      curatedBoards: [first],
      savedBoards: [
        {
          id: "saved-3",
          userId: "user-1",
          boardUrl: second.boardUrl,
          provider: second.provider,
          companyName: "Elsewhere",
          isActive: true,
          lastPolledAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      users: [{ userId: "user-1", includeCurated: false, excludedCuratedBoardUrls: [] }],
    });

    expect(curatedTargets).toEqual([]);
    expect(savedTargets.map((board) => board.key)).toEqual([second.boardUrl.replace(/\/+$/, "").toLowerCase()]);
  });

  it("caps saved boards that are not in the curated catalog", () => {
    const savedBoards = Array.from({ length: 3 }, (_, index) => ({
      id: `saved-${index}`,
      userId: "user-1",
      boardUrl: `https://boards.greenhouse.io/custom-${index}`,
      provider: "greenhouse" as const,
      companyName: `Custom ${index}`,
      isActive: true,
      lastPolledAt: new Date(Date.UTC(2026, 0, index + 1)),
    }));
    const { savedTargets } = buildDiscoveryTargets({
      curatedBoards: [],
      savedBoards,
      users: [{ userId: "user-1", includeCurated: true, excludedCuratedBoardUrls: [] }],
    });
    const capped = savedTargetsWithinCap(
      savedTargets,
      new Map(savedBoards.map((board) => [board.id, board.lastPolledAt])),
      NOW,
      2
    );
    expect(capped.map((board) => board.companyName)).toEqual(["Custom 0", "Custom 1"]);
  });

  it("packs fast boards into one batch and leaves a Workday board for the next", () => {
    const fast = target({ key: "fast", provider: "greenhouse" });
    const workday = target({ key: "bank", provider: "workday" });
    const selection = selectDiscoveryBatch({
      savedTargets: [],
      curatedTargets: [fast, { ...fast, key: "fast-2" }, workday],
      curatedCursor: 0,
      curatedDone: new Set(),
      useCuratedCursor: true,
      budgetMs: FAST_BOARD_ESTIMATE_MS * 2 + 1_000,
    });

    expect(selection.targets.map((board) => board.key)).toEqual(["fast", "fast-2"]);
    expect(selection.done).toBe(false);
    expect(selection.nextCuratedCursor).toBe(2);
    expect(estimateTargetMs(workday)).toBe(WORKDAY_BOARD_ESTIMATE_MS);
    expect(DISCOVER_BATCH_BUDGET_MS).toBeLessThan(300_000);
  });

  it("still polls one Workday board when it is the first board in the batch", () => {
    const workday = target({ key: "bank", provider: "workday" });
    const selection = selectDiscoveryBatch({
      savedTargets: [],
      curatedTargets: [workday, target({ key: "next", provider: "ashby" })],
      curatedCursor: 0,
      curatedDone: new Set(),
      useCuratedCursor: true,
      budgetMs: WORKDAY_BOARD_ESTIMATE_MS,
    });

    expect(selection.targets.map((board) => board.key)).toEqual(["bank"]);
    expect(selection.done).toBe(false);
  });

  it("skips curated boards already polled in this run when the shared cursor is available", () => {
    const boards = [
      target({ key: "done", provider: "lever" }),
      target({ key: "next", provider: "ashby" }),
    ];
    const selection = selectDiscoveryBatch({
      savedTargets: [],
      curatedTargets: boards,
      curatedCursor: 0,
      curatedDone: new Set(["done"]),
      useCuratedCursor: false,
      budgetMs: DISCOVER_BATCH_BUDGET_MS,
    });

    expect(selection.targets.map((board) => board.key)).toEqual(["next"]);
    expect(selection.done).toBe(true);
  });

  it("keeps database work sequential and fetches boards through the adapter", () => {
    const handler = readFileSync(resolve(process.cwd(), "src/lib/cron-discover-handler.ts"), "utf8");
    const batch = handler.slice(handler.indexOf("export async function runDiscoverBatch"));
    expect(batch).not.toContain("Promise.all");

    const poll = readFileSync(resolve(process.cwd(), "src/modules/discovery/poll-board.ts"), "utf8");
    const fetch = poll.slice(
      poll.indexOf("export async function fetchBoardListing"),
      poll.indexOf("export async function pollSavedBoard")
    );
    expect(fetch).toContain("adapter.fetch");
    expect(fetch).not.toContain("await fetch(");
  });
});
