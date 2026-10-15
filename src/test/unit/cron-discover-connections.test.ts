import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inFlight: 0,
  maxInFlight: 0,
  getDb: vi.fn(),
  withUserDb: vi.fn(),
  pollBoardsForUser: vi.fn(),
  fetchBoardListing: vi.fn(),
  processMatchQueue: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: state.getDb,
}));

vi.mock("@/db/user-context", () => ({
  withUserDb: state.withUserDb,
}));

vi.mock("@/modules/discovery/poll-board", () => ({
  fetchBoardListing: state.fetchBoardListing,
  pollBoardsForUser: state.pollBoardsForUser,
  aggregateDiscoverStats: (
    results: Array<{ status: string }>,
    totals: {
      newJobs: number;
      skipped: number;
      matched: number;
      filtered: number;
    }
  ) => ({
    polled: results.length,
    succeeded: results.filter((result) => result.status === "success").length,
    failed: results.filter((result) => result.status !== "success").length,
    newJobs: totals.newJobs,
    skipped: totals.skipped,
    matched: totals.matched,
    filtered: totals.filtered,
  }),
}));

vi.mock("@/modules/matching/match-queue", () => ({
  processMatchQueue: state.processMatchQueue,
}));

import { runCronDiscoverPoll, runDiscoverBatch } from "@/lib/cron-discover-handler";

describe("cron discover connections", () => {
  beforeEach(() => {
    state.inFlight = 0;
    state.maxInFlight = 0;
    state.getDb.mockReset();
    state.withUserDb.mockReset();
    state.pollBoardsForUser.mockReset();
    state.fetchBoardListing.mockReset();
    state.processMatchQueue.mockReset();

    state.getDb.mockReturnValue({
      query: {
        savedBoards: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "b1",
              userId: "u1",
              boardUrl: "https://boards.greenhouse.io/a",
              provider: "greenhouse",
              companyName: "A",
              lastPolledAt: null,
            },
            {
              id: "b2",
              userId: "u2",
              boardUrl: "https://boards.greenhouse.io/b",
              provider: "greenhouse",
              companyName: "B",
              lastPolledAt: null,
            },
          ]),
        },
        searchPreferences: {
          findMany: vi.fn().mockResolvedValue([
            { userId: "u1", discoverCuratedBoards: false, excludedCuratedBoardUrls: [] },
            { userId: "u2", discoverCuratedBoards: false, excludedCuratedBoardUrls: [] },
          ]),
        },
      },
    });
    state.fetchBoardListing.mockImplementation(async (board: { boardUrl: string }) => ({
      boardUrl: board.boardUrl,
      jobs: [],
    }));

    state.withUserDb.mockImplementation(async (_userId: string, fn: (db: object) => Promise<unknown>) => {
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      try {
        return await fn({});
      } finally {
        state.inFlight -= 1;
      }
    });

    state.pollBoardsForUser.mockResolvedValue({
      results: [{ boardId: "b", status: "success" as const }],
      stats: { newJobs: 1, skipped: 0, updated: 0, queuedForMatch: 1, filtered: 0 },
    });
    state.processMatchQueue.mockResolvedValue({ processed: 1, skipped: 0, failed: 0 });
  });

  it("processes users one at a time and matches with concurrency 1", async () => {
    await runCronDiscoverPoll();

    expect(state.maxInFlight).toBe(1);
    expect(state.withUserDb).toHaveBeenCalledTimes(4);
    expect(state.fetchBoardListing).toHaveBeenCalledTimes(2);
    expect(state.processMatchQueue).toHaveBeenCalledTimes(2);
    for (const call of state.processMatchQueue.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ concurrency: 1 }));
    }
  });

  it("fetches a curated board once and attaches it to every included user", async () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    const board = {
      companyName: "Example",
      provider: "greenhouse" as const,
      boardUrl: "https://boards.greenhouse.io/example",
      why: "test",
    };
    state.getDb.mockReturnValue({
      query: {
        savedBoards: { findMany: vi.fn().mockResolvedValue([]) },
        searchPreferences: {
          findMany: vi.fn().mockResolvedValue([
            { userId: userA, discoverCuratedBoards: true, excludedCuratedBoardUrls: [] },
            { userId: userB, discoverCuratedBoards: true, excludedCuratedBoardUrls: [] },
          ]),
        },
      },
      execute: vi.fn().mockResolvedValue([{ user_id: userA }, { user_id: userB }]),
    });

    await runDiscoverBatch({ curatedBoards: [board], budgetMs: 60_000 });

    expect(state.fetchBoardListing).toHaveBeenCalledTimes(1);
    expect(state.pollBoardsForUser).toHaveBeenCalledTimes(2);
    const listings = state.pollBoardsForUser.mock.calls.map(
      (call) => (call[2] as Array<{ listing?: unknown }>)[0]?.listing
    );
    expect(listings[0]).toBe(listings[1]);
    expect(state.maxInFlight).toBe(1);
  });
});
