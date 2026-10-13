import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  summarizeCronPollResults,
  CRON_MATCH_CONCURRENCY,
  CRON_MAX_BOARDS_PER_RUN,
  CRON_MAX_NEW_JOBS_PER_RUN,
  pickLeastRecentlyPolledBoards,
} from "@/lib/cron-discover";
import { aggregateDiscoverStats, pollBoardsForUser } from "@/modules/discovery/poll-board";

describe("cron discover helpers", () => {
  it("summarizes poll results", () => {
    expect(
      summarizeCronPollResults([
        { status: "success" },
        { status: "error" },
        { status: "success" },
      ])
    ).toEqual({ polled: 3, succeeded: 2, failed: 1 });
  });

  it("exports board cap constant", () => {
    expect(CRON_MAX_BOARDS_PER_RUN).toBeGreaterThan(0);
  });

  it("exports new jobs cap constant", () => {
    expect(CRON_MAX_NEW_JOBS_PER_RUN).toBeGreaterThan(0);
  });

  it("matches one job at a time so cron stays on one pooled connection", () => {
    expect(CRON_MATCH_CONCURRENCY).toBe(1);
  });

  it("polls boards one after another", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/discovery/poll-board.ts"),
      "utf8"
    );
    const start = source.indexOf("export async function pollBoardsForUser");
    const fn = source.slice(start, source.indexOf("export function aggregateDiscoverStats"));
    expect(fn).toContain("for (");
    expect(fn).not.toContain("Promise.all");
  });

  it("aggregates discovery stats", () => {
    expect(
      aggregateDiscoverStats(
        [{ status: "success" }, { status: "error" }],
        { newJobs: 5, skipped: 10, matched: 5, filtered: 20 }
      )
    ).toEqual({
      polled: 2,
      succeeded: 1,
      failed: 1,
      newJobs: 5,
      skipped: 10,
      matched: 5,
      filtered: 20,
    });
  });

  it("polls never-checked boards before recently polled ones", () => {
    const boards = [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `recent-${index}`,
        lastPolledAt: new Date("2026-02-01T00:00:00.000Z"),
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `new-${index}`,
        lastPolledAt: null,
      })),
    ];

    const picked = pickLeastRecentlyPolledBoards(boards, CRON_MAX_BOARDS_PER_RUN);
    expect(picked.slice(0, 5).map((board) => board.id)).toEqual([
      "new-0",
      "new-1",
      "new-2",
      "new-3",
      "new-4",
    ]);
    expect(picked).toHaveLength(CRON_MAX_BOARDS_PER_RUN);
    expect(picked.some((board) => board.id === "recent-19")).toBe(false);
  });

  it("orders polled boards by oldest lastPolledAt", () => {
    const picked = pickLeastRecentlyPolledBoards(
      [
        { id: "newest", lastPolledAt: new Date("2026-03-01T00:00:00.000Z") },
        { id: "never", lastPolledAt: null },
        { id: "oldest", lastPolledAt: new Date("2026-01-01T00:00:00.000Z") },
        { id: "middle", lastPolledAt: new Date("2026-02-01T00:00:00.000Z") },
      ],
      3
    );
    expect(picked.map((board) => board.id)).toEqual(["never", "oldest", "middle"]);
  });

  it("stamps lastPolledAt when a board poll fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const db = {
      query: {
        candidateProfiles: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn().mockReturnValue({ set }),
    };

    const { results } = await pollBoardsForUser(
      db as never,
      "user-1",
      [
        {
          id: "board-1",
          boardUrl: "not-a-board",
          provider: "greenhouse",
          companyName: "Acme",
        },
      ],
      { remainingNewJobs: 5 }
    );

    expect(results).toEqual([{ boardId: "board-1", status: "error" }]);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ lastPolledAt: expect.any(Date) })
    );
    errorLog.mockRestore();
  });
});
