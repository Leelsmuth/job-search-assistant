import { describe, expect, it } from "vitest";
import {
  FRESHNESS_DAYS,
  PRIORITY_IDS,
  SUGGESTED_PRIORITY_ORDER,
  formatTenths,
  isSuggestedOrder,
  movePriority,
  parsePriorityOrder,
  priorityPoints,
  priorityTip,
  priorityVerdict,
  sameOrder,
  scoreRoles,
  type PriorityId,
  type PriorityResult,
  type RoleScore,
} from "@/modules/compare/priorities";
import { locationBlocker, type CompareRole } from "@/modules/compare/role";
import {
  AURORA,
  COMPARE_NOW,
  LUMEN,
  MAPLE,
  NORTHWIND,
  TIDEWATER,
  sampleRole,
} from "@/test/fixtures/compare-roles";

const SALARY_FIRST: PriorityId[] = ["salary", "fit", "location", "remote", "freshness"];

function score(roles: CompareRole[], order: readonly PriorityId[] = SUGGESTED_PRIORITY_ORDER) {
  return scoreRoles(roles, order, COMPARE_NOW);
}

function role(result: PriorityResult, jobId: string): RoleScore {
  const found = result.roles.find((candidate) => candidate.jobId === jobId);
  if (!found) throw new Error(`no score for ${jobId}`);
  return found;
}

function entry(scoreFor: RoleScore, id: PriorityId) {
  return scoreFor.priorities.find((candidate) => candidate.id === id)!;
}

function earned(scoreFor: RoleScore, id: PriorityId): number | null {
  const found = entry(scoreFor, id);
  return found.earnedTenths === null ? null : found.earnedTenths / 10;
}

function postedDaysAgo(days: number): string {
  return new Date(COMPARE_NOW.getTime() - days * 86_400_000).toISOString();
}

describe("priority order", () => {
  it("suggests fit first and ranks all five priorities", () => {
    expect(SUGGESTED_PRIORITY_ORDER[0]).toBe("fit");
    expect([...SUGGESTED_PRIORITY_ORDER].sort()).toEqual([...PRIORITY_IDS].sort());
  });

  it("gives the top priority 5 points and the last 1", () => {
    expect(SUGGESTED_PRIORITY_ORDER.map((id) => priorityPoints(SUGGESTED_PRIORITY_ORDER, id))).toEqual([
      5, 4, 3, 2, 1,
    ]);
    expect(priorityPoints(SALARY_FIRST, "salary")).toBe(5);
  });

  it("moves a priority up or down, clamped to the list", () => {
    expect(movePriority(SUGGESTED_PRIORITY_ORDER, "salary", 0)).toEqual(SALARY_FIRST);
    expect(movePriority(SUGGESTED_PRIORITY_ORDER, "fit", 3)).toEqual([
      "location",
      "salary",
      "remote",
      "fit",
      "freshness",
    ]);
    expect(movePriority(SUGGESTED_PRIORITY_ORDER, "fit", 99).at(-1)).toBe("fit");
    expect(movePriority(SUGGESTED_PRIORITY_ORDER, "fit", -3)).toBe(SUGGESTED_PRIORITY_ORDER);
  });

  it("reads a stored order, filling in anything missing", () => {
    expect(parsePriorityOrder(SALARY_FIRST)).toEqual(SALARY_FIRST);
    // Unknown and repeated entries are dropped; missing ones follow in the suggested order.
    expect(parsePriorityOrder(["remote", "commute", "remote", 4])).toEqual([
      "remote",
      "fit",
      "location",
      "salary",
      "freshness",
    ]);
    expect(parsePriorityOrder("fit")).toEqual([...SUGGESTED_PRIORITY_ORDER]);
    expect(parsePriorityOrder(null)).toEqual([...SUGGESTED_PRIORITY_ORDER]);
  });

  it("knows when the person is on the suggested order, and compares orders", () => {
    expect(isSuggestedOrder(SUGGESTED_PRIORITY_ORDER)).toBe(true);
    expect(isSuggestedOrder(SALARY_FIRST)).toBe(false);
    expect(sameOrder(SALARY_FIRST, [...SALARY_FIRST])).toBe(true);
    expect(sameOrder(SALARY_FIRST, SUGGESTED_PRIORITY_ORDER)).toBe(false);
  });

  it("nudges towards fit only when it drops below #2, and respects the order", () => {
    expect(priorityTip(SUGGESTED_PRIORITY_ORDER)).toBeNull();
    expect(priorityTip(SALARY_FIRST)).toBeNull();
    const tip = priorityTip(["salary", "remote", "location", "fit", "freshness"]);
    expect(tip).toContain("Fit is ranked #4");
    expect(tip).toContain("Your order is what counts.");
  });
});

describe("scoreRoles", () => {
  it("earns a share of each priority's points", () => {
    const result = score([sampleRole(NORTHWIND), sampleRole(LUMEN)]);
    const northwind = role(result, NORTHWIND);
    expect(earned(northwind, "fit")).toBe(4.6); // 91% of 5
    expect(earned(northwind, "location")).toBe(4); // open to the profile
    expect(earned(northwind, "salary")).toBe(2.4); // 165k of the top 210k, of 3
    expect(earned(northwind, "remote")).toBe(2);
    expect(earned(northwind, "freshness")).toBe(1);
    expect(earned(role(result, LUMEN), "salary")).toBe(3);
    expect(result.maxTenths).toBe(150);
  });

  it("adds totals from the rounded points, so the numbers shown add up", () => {
    const result = score([sampleRole(NORTHWIND), sampleRole(LUMEN), sampleRole(MAPLE)], SALARY_FIRST);
    for (const scored of result.roles) {
      const sum = scored.priorities.reduce((total, item) => total + (item.earnedTenths ?? 0), 0);
      expect(scored.totalTenths).toBe(sum);
    }
  });

  it("lists priorities in the person's order", () => {
    const result = score([sampleRole(NORTHWIND), sampleRole(LUMEN)], SALARY_FIRST);
    expect(result.roles[0].priorities.map((item) => item.id)).toEqual(SALARY_FIRST);
  });

  it("lets the ranking change the winner", () => {
    const roles = [sampleRole(NORTHWIND), sampleRole(LUMEN)];
    expect(role(score(roles), NORTHWIND).rank).toBe(1);
    const salaryFirst = score(roles, SALARY_FIRST);
    expect(role(salaryFirst, LUMEN).rank).toBe(1);
    expect(role(salaryFirst, NORTHWIND).rank).toBe(2);
  });

  it("gives half the remote points to hybrid and none to on-site", () => {
    const result = score([sampleRole(MAPLE), sampleRole(AURORA)]);
    expect(earned(role(result, MAPLE), "remote")).toBe(1);
    expect(earned(role(result, AURORA), "remote")).toBe(0);
  });

  it("gives no location points to roles you cannot take", () => {
    const result = score([sampleRole(TIDEWATER), sampleRole(AURORA), sampleRole(NORTHWIND)]);
    expect(earned(role(result, TIDEWATER), "location")).toBe(0);
    expect(entry(role(result, TIDEWATER), "location").detail).toBe("Needs US work authorization");
    expect(earned(role(result, AURORA), "location")).toBe(0);
  });

  it("follows the person's location settings", () => {
    // Hybrid in the GTA, with hybrid turned off in Settings.
    const hybridOff = sampleRole(MAPLE, {
      locationBlocker: locationBlocker("hybrid_gta", [], { includeHybridGta: false, includeOnsiteGta: true }),
    });
    const result = score([hybridOff, sampleRole(NORTHWIND)]);
    expect(earned(role(result, MAPLE), "location")).toBe(0);
    expect(entry(role(result, MAPLE), "location").detail).toBe("Hybrid, which is off in your Settings");
  });

  it("fades freshness to nothing over 30 days", () => {
    const posted = (days: number) =>
      earned(score([sampleRole(NORTHWIND, { postedAt: postedDaysAgo(days) })]).roles[0], "freshness");
    expect(posted(0)).toBe(1);
    expect(posted(15)).toBe(0.5);
    expect(posted(FRESHNESS_DAYS * 2)).toBe(0);
  });

  it("leaves salary out when the roles pay in different currencies", () => {
    const result = score([sampleRole(NORTHWIND), sampleRole(TIDEWATER)], SALARY_FIRST);
    expect(result.unscored).toEqual([
      { id: "salary", reason: "Salary is not scored: CAD and USD cannot be compared directly." },
    ]);
    expect(earned(role(result, NORTHWIND), "salary")).toBeNull();
    // The maximum drops by salary's 5 points.
    expect(result.maxTenths).toBe(100);
  });

  it("leaves salary out when none of the roles lists one", () => {
    const unlisted = { salaryMin: null, salaryMax: null };
    const result = score([sampleRole(NORTHWIND, unlisted), sampleRole(MAPLE, unlisted)]);
    expect(result.unscored[0].reason).toContain("none of these roles lists one");
  });

  it("shares a rank between tied totals", () => {
    const result = score([sampleRole(NORTHWIND), sampleRole(NORTHWIND, { id: "twin" }), sampleRole(MAPLE)]);
    expect(result.roles.map((scored) => scored.rank)).toEqual([1, 1, 3]);
  });
});

describe("unknowns earn half points", () => {
  it("gives half the salary points to a role that does not list one", () => {
    const unlisted = sampleRole(MAPLE, { salaryMin: null, salaryMax: null });
    const result = score([sampleRole(NORTHWIND), unlisted], SALARY_FIRST);
    const maple = entry(role(result, MAPLE), "salary");
    expect(maple.earnedTenths).toBe(25); // half of 5
    expect(maple.unknown).toBe(true);
    expect(maple.detail).toBe("Not listed (half points)");
    // Listing a salary is not penalised either: the listed one is scored as before.
    expect(earned(role(result, NORTHWIND), "salary")).toBe(5);
  });

  it("gives half points when the work arrangement or location is not stated", () => {
    const unstated = sampleRole(NORTHWIND, { workplaceType: null, locationClass: null, locationBlocker: null });
    const result = score([unstated, sampleRole(MAPLE)]);
    const northwind = role(result, NORTHWIND);
    expect(earned(northwind, "remote")).toBe(1); // half of 2
    expect(entry(northwind, "remote").detail).toBe("Not stated (half points)");
    expect(earned(northwind, "location")).toBe(2); // half of 4
    expect(entry(northwind, "location").detail).toBe("Location not stated (half points)");
  });

  it("gives half the fit points to a role without a fit score yet", () => {
    const unscored = sampleRole(NORTHWIND, { fitScore: null });
    const fit = entry(role(score([unscored, sampleRole(MAPLE)]), NORTHWIND), "fit");
    expect(fit.earnedTenths).toBe(25);
    expect(fit.detail).toBe("No fit score yet (half points)");
  });

  it("marks known values as known", () => {
    const result = score([sampleRole(NORTHWIND), sampleRole(MAPLE)]);
    for (const scored of result.roles) {
      expect(scored.priorities.every((item) => !item.unknown)).toBe(true);
    }
  });
});

describe("priorityVerdict", () => {
  function verdict(roles: CompareRole[], order: readonly PriorityId[] = SUGGESTED_PRIORITY_ORDER) {
    return priorityVerdict(roles, order, score(roles, order))!;
  }

  it("names the best role, its score, and what it leads on", () => {
    const result = verdict([sampleRole(NORTHWIND), sampleRole(LUMEN)]);
    expect(result.bestIds).toEqual([NORTHWIND]);
    expect(result.headline).toBe(
      "Best for your priorities: Senior Frontend Engineer at Northwind Labs, with 14 of 15 points."
    );
    expect(result.reason).toBe("It leads on fit (your #1) and freshness (your #5).");
    expect(result.fitNudge).toBeNull();
    expect(result.caution).toBeNull();
  });

  it("respects the ranking, but points at the role the person fits best", () => {
    const result = verdict([sampleRole(NORTHWIND), sampleRole(LUMEN)], SALARY_FIRST);
    expect(result.bestIds).toEqual([LUMEN]);
    expect(result.reason).toBe("It leads on salary (your #1).");
    expect(result.fitNudge).toBe(
      "For the best chance of hearing back, Senior Frontend Engineer at Northwind Labs fits you best (91 fit vs 78)."
    );
  });

  it("skips the fit nudge when the fits are close", () => {
    // Lumen still wins on salary, but 88 vs 91 is too close to be worth a nudge.
    expect(verdict([sampleRole(NORTHWIND), sampleRole(LUMEN, { fitScore: 88 })], SALARY_FIRST).fitNudge).toBeNull();
  });

  it("nudges towards a scored role when the winner has no fit score yet", () => {
    const fitLast: PriorityId[] = ["salary", "location", "remote", "freshness", "fit"];
    const result = verdict([sampleRole(NORTHWIND), sampleRole(LUMEN, { fitScore: null })], fitLast);
    expect(result.bestIds).toEqual([LUMEN]);
    expect(result.fitNudge).toContain("(91 fit vs no score)");
  });

  it("warns when the winner has a blocker the person ranked low", () => {
    const payFirst: PriorityId[] = ["salary", "remote", "fit", "freshness", "location"];
    const result = verdict([sampleRole(TIDEWATER), sampleRole(MAPLE, { salaryCurrency: "USD" })], payFirst);
    expect(result.bestIds).toEqual([TIDEWATER]);
    expect(result.caution).toBe("It needs US work authorization.");
  });

  it("reports ties", () => {
    const twin = sampleRole(NORTHWIND, { id: "twin", title: "Twin Engineer" });
    // Alone together, each is the best payer too, so both earn all the salary points.
    expect(verdict([sampleRole(NORTHWIND), twin]).headline).toBe(
      "These roles tie on your priorities, at 14.6 of 15 points each."
    );
    const tied = verdict([sampleRole(NORTHWIND), twin, sampleRole(MAPLE)]);
    expect(tied.bestIds).toEqual([NORTHWIND, "twin"]);
    expect(tied.headline).toBe(
      "Senior Frontend Engineer at Northwind Labs and Twin Engineer at Northwind Labs tie as the best match for your priorities, at 14.6 of 15 points each."
    );
  });

  it("formats points without a trailing .0", () => {
    expect(formatTenths(140)).toBe("14");
    expect(formatTenths(138)).toBe("13.8");
  });
});
