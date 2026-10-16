import { describe, expect, it } from "vitest";
import { isQuietHours, planInstantAlerts, type AlertCandidate } from "@/modules/alerts/gating";

const DAY = new Date("2026-10-16T15:00:00.000Z");
const QUIET = new Date("2026-10-16T03:00:00.000Z");

function candidate(overrides: Partial<AlertCandidate> = {}): AlertCandidate {
  return {
    jobId: "job-1",
    fitScore: 80,
    fitEligible: true,
    postedAt: new Date("2026-10-16T14:00:00.000Z"),
    ...overrides,
  };
}

describe("instant alert gating", () => {
  it("treats 10 PM through 7 AM Toronto as quiet hours", () => {
    expect(isQuietHours(QUIET)).toBe(true);
    expect(isQuietHours(DAY)).toBe(false);
    expect(isQuietHours(new Date("2026-10-16T01:30:00.000Z"))).toBe(false);
    expect(isQuietHours(new Date("2026-10-16T10:30:00.000Z"))).toBe(true);
  });

  it("sends a fresh eligible job and stops at the daily cap", () => {
    const open = planInstantAlerts({
      now: DAY,
      enabled: true,
      minFit: 55,
      dailyCap: 10,
      sentToday: 9,
      alreadyAlertedJobIds: new Set(),
      candidates: [candidate({ jobId: "a" }), candidate({ jobId: "b" })],
    });
    expect(open.sendJobIds).toEqual(["a"]);
    expect(open.queue).toEqual([]);

    const capped = planInstantAlerts({
      now: DAY,
      enabled: true,
      minFit: 55,
      dailyCap: 10,
      sentToday: 10,
      alreadyAlertedJobIds: new Set(),
      candidates: [candidate()],
    });
    expect(capped.sendJobIds).toEqual([]);
  });

  it("queues during quiet hours and never repeats an alerted job", () => {
    const quiet = planInstantAlerts({
      now: QUIET,
      enabled: true,
      minFit: 55,
      dailyCap: 10,
      sentToday: 0,
      alreadyAlertedJobIds: new Set(),
      candidates: [candidate({ postedAt: new Date("2026-10-16T02:00:00.000Z") })],
    });
    expect(quiet.sendJobIds).toEqual([]);
    expect(quiet.queue).toHaveLength(1);
    expect(quiet.queue[0]?.queuedUntil.getTime()).toBeGreaterThan(QUIET.getTime());

    const duplicate = planInstantAlerts({
      now: DAY,
      enabled: true,
      minFit: 55,
      dailyCap: 10,
      sentToday: 0,
      alreadyAlertedJobIds: new Set(["job-1"]),
      candidates: [candidate(), candidate({ jobId: "job-1" })],
    });
    expect(duplicate.sendJobIds).toEqual([]);
  });

  it("drops ineligible, low-fit, old, and disabled jobs", () => {
    const plan = planInstantAlerts({
      now: DAY,
      enabled: true,
      minFit: 55,
      dailyCap: 10,
      sentToday: 0,
      alreadyAlertedJobIds: new Set(),
      candidates: [
        candidate({ jobId: "low", fitScore: 40 }),
        candidate({ jobId: "blocked", fitEligible: false, fitScore: 99 }),
        candidate({ jobId: "old", postedAt: new Date("2026-10-14T00:00:00.000Z") }),
        candidate({ jobId: "ok" }),
      ],
    });
    expect(plan.sendJobIds).toEqual(["ok"]);

    const off = planInstantAlerts({
      now: DAY,
      enabled: false,
      minFit: 55,
      dailyCap: 10,
      sentToday: 0,
      alreadyAlertedJobIds: new Set(),
      candidates: [candidate()],
    });
    expect(off.sendJobIds).toEqual([]);
    expect(off.queue).toEqual([]);
  });
});
