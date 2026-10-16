import { describe, expect, it } from "vitest";
import {
  acquireLease,
  conditionalRequestHeaders,
  emptyRateState,
  isNotModifiedStatus,
  listingNewerThanCursor,
  markProvider,
  providerSlot,
  selectTickBatch,
  type TickCandidate,
} from "@/modules/discovery/tick-plan";

const NOW = new Date("2026-10-16T15:00:00.000Z");

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
    const first = selectTickBatch({
      saved: [candidate({ key: "saved", origin: "saved", estimateMs: 20_000 })],
      curated: [
        candidate({ key: "rest-a", estimateMs: 20_000 }),
        candidate({ key: "rest-b", estimateMs: 20_000 }),
        candidate({ key: "rest-c", estimateMs: 20_000 }),
      ],
      feeds: [],
      cursor: 0,
      budgetMs: 40_000,
    });
    expect(first.targets.map((item) => item.key)).toEqual(["saved", "rest-a"]);
    expect(first.nextCursor).toBe(1);

    const second = selectTickBatch({
      saved: [],
      curated: [
        candidate({ key: "rest-a", estimateMs: 20_000 }),
        candidate({ key: "rest-b", estimateMs: 20_000 }),
        candidate({ key: "rest-c", estimateMs: 20_000 }),
      ],
      feeds: [],
      cursor: first.nextCursor,
      budgetMs: 20_000,
    });
    expect(second.targets.map((item) => item.key)).toEqual(["rest-b"]);
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
  });
});
