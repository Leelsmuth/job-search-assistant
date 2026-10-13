import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inFlight: 0,
  maxInFlight: 0,
  getDb: vi.fn(),
  withUserDb: vi.fn(),
  pollBoardsForUser: vi.fn(),
  processMatchQueue: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: state.getDb,
}));

vi.mock("@/db/user-context", () => ({
  withUserDb: state.withUserDb,
}));

vi.mock("@/modules/discovery/poll-board", () => ({
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

import { runCronDiscoverPoll } from "@/lib/cron-discover-handler";

describe("cron discover connections", () => {
  beforeEach(() => {
    state.inFlight = 0;
    state.maxInFlight = 0;
    state.getDb.mockReset();
    state.withUserDb.mockReset();
    state.pollBoardsForUser.mockReset();
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
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    });

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
    expect(state.processMatchQueue).toHaveBeenCalledTimes(2);
    for (const call of state.processMatchQueue.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ concurrency: 1 }));
    }
  });
});
