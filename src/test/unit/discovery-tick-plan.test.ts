import { describe, expect, it } from "vitest";
import {
  acquireLease,
  conditionalRequestHeaders,
  emptyRateState,
  HIGH_SIGNAL_MIN_INTERVAL_MS,
  isNotModifiedStatus,
  jobsSinceCursor,
  listingNewerThanCursor,
  markProvider,
  providerSlot,
  selectTickBatch,
  TICK_BUDGET_MS,
  type TickCandidate,
} from "@/modules/discovery/tick-plan";

const NOW = new Date("2026-10-16T15:00:00.000Z");

function sumEstimates(items: readonly TickCandidate[]): number {
  return items.reduce((sum, item) => sum + item.estimateMs, 0);
}

function candidate(overrides: Partial<TickCandidate> & Pick<TickCandidate, "key">): TickCandidate {
  return {
    provider: "greenhouse",
    origin: "curated",
    highSignal: false,
    lastPolledAt: null,
    estimateMs: 10_000,
    ...overrides,
  };
}

describe("discovery tick plan", () => {
  it("polls saved boards, then high-signal boards, then fast feeds, then a rotating slice", () => {
    const selection = selectTickBatch({
      saved: [
        candidate({ key: "saved-new", origin: "saved", lastPolledAt: new Date("2026-10-16T12:00:00.000Z") }),
        candidate({ key: "saved-old", origin: "saved", lastPolledAt: null }),
      ],
      curated: [
        candidate({ key: "high", highSignal: true, lastPolledAt: new Date("2026-10-15T12:00:00.000Z") }),
        candidate({ key: "rest-a" }),
        candidate({ key: "rest-b" }),
      ],
      feeds: [
        candidate({ key: "feed:remotive", provider: "remotive", origin: "feed", estimateMs: 5_000 }),
        candidate({ key: "feed:jobbank", provider: "jobbank", origin: "feed", estimateMs: 5_000 }),
      ],
      cursor: 0,
      budgetMs: 80_000,
      now: NOW,
    });

    expect(selection.targets.map((item) => item.key)).toEqual([
      "saved-old",
      "saved-new",
      "high",
      "feed:remotive",
      "rest-a",
      "rest-b",
      "feed:jobbank",
    ]);
  });

  it("keeps a tick inside the budget and rotates the remainder", () => {
    const curated = [
      candidate({ key: "rest-a", estimateMs: 20_000 }),
      candidate({ key: "rest-b", estimateMs: 20_000 }),
      candidate({ key: "rest-c", estimateMs: 20_000 }),
    ];
    const first = selectTickBatch({
      saved: [candidate({ key: "saved", origin: "saved", estimateMs: 20_000 })],
      curated,
      feeds: [],
      cursor: 0,
      budgetMs: 40_000,
      now: NOW,
    });
    // The rotating queue costs more than the budget, so the reserved share is the
    // whole tick and saved waits. Two 20s boards fit; the cursor stops before the third.
    expect(first.targets.map((item) => item.key)).toEqual(["rest-a", "rest-b"]);
    expect(first.nextCursor).toBe(2);
    expect(sumEstimates(first.targets)).toBeLessThanOrEqual(40_000);

    const second = selectTickBatch({
      saved: [],
      curated,
      feeds: [],
      cursor: first.nextCursor,
      budgetMs: 20_000,
      now: NOW,
    });
    expect(second.targets.map((item) => item.key)).toEqual(["rest-c"]);
    expect(second.nextCursor).toBe(0);
  });

  it("reserves a rotating slot when due high-signal boards would fill the budget", () => {
    const highSignal = Array.from({ length: 9 }, (_, index) =>
      candidate({
        key: `high-${index}`,
        highSignal: true,
        lastPolledAt: new Date("2026-10-15T12:00:00.000Z"),
        estimateMs: 10_000,
      })
    );
    const rotating = [
      candidate({ key: "workday-rbc", provider: "workday", estimateMs: 70_000 }),
      ...Array.from({ length: 4 }, (_, index) => candidate({ key: `board-${index}`, estimateMs: 10_000 })),
    ];
    const selection = selectTickBatch({
      saved: [],
      curated: [...highSignal, ...rotating],
      feeds: [],
      cursor: 0,
      budgetMs: TICK_BUDGET_MS,
      now: NOW,
    });

    expect(selection.targets.map((item) => item.key)).toEqual(["high-0", "high-1", "workday-rbc"]);
    expect(selection.nextCursor).toBe(1);
    expect(sumEstimates(selection.targets)).toBeLessThanOrEqual(TICK_BUDGET_MS);
    expect(selection.targets.some((item) => item.key === "workday-rbc")).toBe(true);
  });

  it("does not repoll a high-signal board inside the minimum interval", () => {
    const recent = new Date(NOW.getTime() - 30 * 60 * 1000);
    const curated = [
      candidate({ key: "hot", highSignal: true, lastPolledAt: recent }),
      candidate({ key: "rest-a" }),
      candidate({ key: "rest-b" }),
    ];
    const held = selectTickBatch({
      saved: [],
      curated,
      feeds: [],
      cursor: 0,
      budgetMs: TICK_BUDGET_MS,
      now: NOW,
    });
    expect(held.targets.map((item) => item.key)).toEqual(["rest-a", "rest-b"]);
    expect(held.nextCursor).toBe(0);

    const due = selectTickBatch({
      saved: [],
      curated,
      feeds: [],
      cursor: 0,
      budgetMs: TICK_BUDGET_MS,
      now: new Date(recent.getTime() + HIGH_SIGNAL_MIN_INTERVAL_MS),
    });
    expect(due.targets.map((item) => item.key)).toContain("hot");
  });

  it("polls every rotating board, including Workday, within a few hours of ticks", () => {
    const recent = new Date(NOW.getTime() - 30 * 60 * 1000);
    const workdayKeys = ["rbc", "td", "bmo", "cibc", "manulife", "sun-life", "thomson-reuters"];
    const workdays = workdayKeys.map((key) =>
      candidate({ key: `workday-${key}`, provider: "workday", estimateMs: 70_000 })
    );
    const others = Array.from({ length: 60 }, (_, index) =>
      candidate({ key: `board-${index}`, estimateMs: 10_000 })
    );
    const dueWorkday = candidate({
      key: "workday-td-hot",
      provider: "workday",
      highSignal: true,
      lastPolledAt: null,
      estimateMs: 70_000,
    });
    const held = candidate({
      key: "hot-greenhouse",
      highSignal: true,
      lastPolledAt: recent,
      estimateMs: 10_000,
    });
    const curated = [held, dueWorkday, ...workdays, ...others];
    const expected = new Set<string>([dueWorkday.key, ...workdays.map((item) => item.key), ...others.map((item) => item.key)]);

    let cursor = 0;
    const seen = new Set<string>();
    for (let tick = 0; tick < 16; tick += 1) {
      const selection = selectTickBatch({
        saved: [],
        curated,
        feeds: [],
        cursor,
        budgetMs: TICK_BUDGET_MS,
        now: NOW,
      });
      expect(selection.targets.some((item) => item.key === held.key)).toBe(false);
      expect(sumEstimates(selection.targets)).toBeLessThanOrEqual(TICK_BUDGET_MS);
      expect(selection.nextCursor).not.toBe(cursor);
      for (const item of selection.targets) seen.add(item.key);
      cursor = selection.nextCursor;
    }

    for (const key of expected) expect(seen.has(key)).toBe(true);
  });

  it("refuses a second lease while the first is still held", () => {
    const first = acquireLease(null, "tick-a", NOW);
    expect(first.acquired).toBe(true);
    const overlap = acquireLease(first.next, "tick-b", new Date(NOW.getTime() + 30_000));
    expect(overlap.acquired).toBe(false);
    expect(overlap.next.owner).toBe("tick-a");
    const later = acquireLease(first.next, "tick-b", new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(later.acquired).toBe(true);
    expect(later.next.owner).toBe("tick-b");
  });

  it("rate-limits a provider and sends conditional validators", () => {
    const state = emptyRateState();
    expect(providerSlot(state, "workday", 0).allowed).toBe(true);
    markProvider(state, "workday", 0);
    markProvider(state, "workday", 2_000);
    expect(providerSlot(state, "workday", 4_000).allowed).toBe(false);
    expect(providerSlot(state, "greenhouse", 0)).toEqual({ allowed: true, waitMs: 0 });
    markProvider(state, "greenhouse", 1_000);
    expect(providerSlot(state, "greenhouse", 1_100).waitMs).toBeGreaterThan(0);

    expect(conditionalRequestHeaders({ etag: '"abc"', lastModified: "Mon, 01 Jan 2026 00:00:00 GMT" })).toEqual({
      "If-None-Match": '"abc"',
      "If-Modified-Since": "Mon, 01 Jan 2026 00:00:00 GMT",
    });
    expect(isNotModifiedStatus(304)).toBe(true);
    const jobs = [
      { id: "old", datePosted: "2026-10-01T00:00:00.000Z" },
      { id: "new", datePosted: "2026-10-16T00:00:00.000Z" },
      { id: "undated", datePosted: null },
    ];
    expect(listingNewerThanCursor(jobs, "2026-10-10T00:00:00.000Z").map((job) => job.id)).toEqual([
      "new",
      "undated",
    ]);
    expect(
      jobsSinceCursor("workday", jobs, "2026-10-19T00:00:00.000Z").map((job) => job.id)
    ).toEqual(["old", "new", "undated"]);
    expect(jobsSinceCursor("greenhouse", jobs, "2026-10-10T00:00:00.000Z").map((job) => job.id)).toEqual([
      "new",
      "undated",
    ]);
  });
});
