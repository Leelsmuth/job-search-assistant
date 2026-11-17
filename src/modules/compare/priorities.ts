/**
 * Priority ranking for comparing roles. The person ranks what matters to
 * them; the top priority is worth the most points, and each compared role
 * earns a share of every priority's points. Pure functions only. The demo
 * keeps the order in localStorage; signed-in users keep it on their account
 * (search_preferences.compare_priorities).
 *
 * We suggest an order that puts fit first, since roles you fit are the ones
 * you are most likely to hear back from, but the person's order always
 * decides the result.
 *
 * Anything a posting does not say (salary, work arrangement, location) and a
 * role without a fit score yet earns half the points: unknown is treated as
 * neutral, neither rewarded nor punished, and the breakdown says so.
 */
import {
  normalizeWorkplace,
  roleSubject,
  salaryCurrencies,
  salaryValue,
  type CompareRole,
} from "@/modules/compare/role";

export const PRIORITY_IDS = ["fit", "salary", "location", "remote", "freshness"] as const;
export type PriorityId = (typeof PRIORITY_IDS)[number];

export const PRIORITIES: Record<PriorityId, { label: string; description: string }> = {
  fit: { label: "Fit", description: "How well the role matches your skills" },
  salary: { label: "Salary", description: "The top of the posted pay range" },
  location: { label: "Location", description: "In your area, with no work authorization blocker" },
  remote: { label: "Remote", description: "Remote beats hybrid; hybrid beats on-site" },
  freshness: { label: "Freshness", description: "Posted recently, so you can apply early" },
};

/** What we suggest: fit first, then whether you can take the job at all. */
export const SUGGESTED_PRIORITY_ORDER: readonly PriorityId[] = [
  "fit",
  "location",
  "salary",
  "remote",
  "freshness",
];

/** Freshness points fade to nothing over this many days. */
export const FRESHNESS_DAYS = 30;

/** Share of a priority's points for something the posting does not tell us. */
export const UNKNOWN_SHARE = 0.5;

/** Fit ranked lower than this (1-based) gets a gentle tip. */
const FIT_TIP_BELOW_RANK = 2;
/** Mention the highest-fit role when it beats the winner's fit by at least this much. */
const FIT_GAP_WORTH_MENTIONING = 5;

export function isPriorityId(value: unknown): value is PriorityId {
  return typeof value === "string" && (PRIORITY_IDS as readonly string[]).includes(value);
}

/** Points for a priority: the top of a five-item list earns 5, the bottom 1. */
export function priorityPoints(order: readonly PriorityId[], id: PriorityId): number {
  const index = order.indexOf(id);
  return index === -1 ? 0 : order.length - index;
}

/**
 * Read a stored order. Keeps known priorities in the stored order and appends
 * any that are missing in the suggested order, so a priority added later
 * never wipes out the person's ranking.
 */
export function parsePriorityOrder(value: unknown): PriorityId[] {
  const order: PriorityId[] = [];
  if (Array.isArray(value)) {
    for (const id of value) if (isPriorityId(id) && !order.includes(id)) order.push(id);
  }
  for (const id of SUGGESTED_PRIORITY_ORDER) if (!order.includes(id)) order.push(id);
  return order;
}

/** Move one priority to a new position. Returns the same array when nothing moves. */
export function movePriority(
  order: readonly PriorityId[],
  id: PriorityId,
  toIndex: number
): readonly PriorityId[] {
  const from = order.indexOf(id);
  const to = Math.max(0, Math.min(order.length - 1, toIndex));
  if (from === -1 || from === to) return order;
  const next = order.filter((candidate) => candidate !== id);
  next.splice(to, 0, id);
  return next;
}

export function isSuggestedOrder(order: readonly PriorityId[]): boolean {
  return order.every((id, index) => SUGGESTED_PRIORITY_ORDER[index] === id);
}

export function sameOrder(a: readonly PriorityId[], b: readonly PriorityId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** A gentle push towards fit. Null when fit is already near the top. */
export function priorityTip(order: readonly PriorityId[]): string | null {
  const rank = order.indexOf("fit") + 1;
  if (rank <= FIT_TIP_BELOW_RANK) return null;
  return `Fit is ranked #${rank}. Roles that fit your skills are the ones you are most likely to hear back from, so you may want it higher. Your order is what counts.`;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type PriorityScore = {
  id: PriorityId;
  /** Points this priority is worth, from its rank. */
  points: number;
  /** Points this role earned, in tenths so totals add up exactly. Null when not scored. */
  earnedTenths: number | null;
  /** Short reason, e.g. "91 fit" or "Not listed (half points)". */
  detail: string;
  /** True when the role earned half points because the posting does not say. */
  unknown: boolean;
};

export type RoleScore = {
  jobId: string;
  totalTenths: number;
  /** In the person's priority order. */
  priorities: PriorityScore[];
  /** 1 for the best total; tied totals share a rank. */
  rank: number;
};

export type PriorityResult = {
  roles: RoleScore[];
  /** Highest possible total, in tenths: the points of every priority that was scored. */
  maxTenths: number;
  /** Priorities left out for every role, with the reason. */
  unscored: Array<{ id: PriorityId; reason: string }>;
};

type Share = { share: number; detail: string; unknown?: boolean };

const HALF = " (half points)";

function fitShare(role: CompareRole): Share {
  if (role.fitScore === null) {
    return { share: UNKNOWN_SHARE, detail: `No fit score yet${HALF}`, unknown: true };
  }
  return { share: Math.max(0, Math.min(100, role.fitScore)) / 100, detail: `${role.fitScore} fit` };
}

function remoteShare(role: CompareRole): Share {
  const workplace = normalizeWorkplace(role.workplaceType);
  if (workplace === "remote") return { share: 1, detail: "Remote" };
  if (workplace === "hybrid") return { share: 0.5, detail: "Hybrid" };
  if (workplace === "on_site") return { share: 0, detail: "On-site" };
  return { share: UNKNOWN_SHARE, detail: `Not stated${HALF}`, unknown: true };
}

function locationShare(role: CompareRole): Share {
  if (role.locationBlocker) return { share: 0, detail: role.locationBlocker.detail };
  if (role.locationClass === null) {
    return { share: UNKNOWN_SHARE, detail: `Location not stated${HALF}`, unknown: true };
  }
  return { share: 1, detail: "Open to you" };
}

function freshnessShare(role: CompareRole, now: Date): Share {
  const hours = Math.max(0, (now.getTime() - new Date(role.postedAt).getTime()) / 3_600_000);
  const days = hours / 24;
  const share = Math.max(0, 1 - days / FRESHNESS_DAYS);
  const detail = hours < 24 ? `${Math.floor(hours)}h old` : `${Math.floor(days)}d old`;
  return { share, detail };
}

function formatThousands(value: number, currency: string): string {
  return `${currency} ${Math.round(value / 1000)}k`;
}

/**
 * Score the compared roles against the person's priorities.
 *
 * - Fit: the fit score as a share (91 fit earns 91% of the points).
 * - Salary: the top of the range as a share of the best-paying role. Not
 *   scored at all when salaries are in different currencies, since they
 *   cannot be compared; half points for a role that does not list one.
 * - Location: all points when the role is open to the person (see
 *   locationBlocker), none when it is blocked.
 * - Remote: all points for remote, half for hybrid, none for on-site.
 * - Freshness: all points today, fading to none after FRESHNESS_DAYS.
 */
export function scoreRoles(
  roles: readonly CompareRole[],
  order: readonly PriorityId[],
  now: Date = new Date()
): PriorityResult {
  const currencies = salaryCurrencies(roles);
  const topSalary = Math.max(0, ...roles.map((role) => salaryValue(role) ?? 0));

  const unscored: PriorityResult["unscored"] = [];
  if (order.includes("salary")) {
    if (currencies.length > 1) {
      unscored.push({
        id: "salary",
        reason: `Salary is not scored: ${currencies.join(" and ")} cannot be compared directly.`,
      });
    } else if (currencies.length === 0) {
      unscored.push({ id: "salary", reason: "Salary is not scored: none of these roles lists one." });
    }
  }
  const skipped = new Set(unscored.map((entry) => entry.id));

  function share(role: CompareRole, id: PriorityId): Share {
    switch (id) {
      case "fit":
        return fitShare(role);
      case "salary": {
        const value = salaryValue(role);
        if (value === null) return { share: UNKNOWN_SHARE, detail: `Not listed${HALF}`, unknown: true };
        return { share: value / topSalary, detail: formatThousands(value, role.salaryCurrency ?? "CAD") };
      }
      case "location":
        return locationShare(role);
      case "remote":
        return remoteShare(role);
      case "freshness":
        return freshnessShare(role, now);
    }
  }

  const scored = roles.map((role) => {
    const priorities = order.map((id): PriorityScore => {
      const points = priorityPoints(order, id);
      const { share: value, detail, unknown = false } = share(role, id);
      if (skipped.has(id)) return { id, points, earnedTenths: null, detail, unknown: false };
      return { id, points, earnedTenths: Math.round(points * value * 10), detail, unknown };
    });
    const totalTenths = priorities.reduce((sum, entry) => sum + (entry.earnedTenths ?? 0), 0);
    return { jobId: role.id, totalTenths, priorities };
  });

  const ranked = scored.map((role) => ({
    ...role,
    rank: 1 + scored.filter((other) => other.totalTenths > role.totalTenths).length,
  }));
  const maxTenths = order
    .filter((id) => !skipped.has(id))
    .reduce((sum, id) => sum + priorityPoints(order, id) * 10, 0);

  return { roles: ranked, maxTenths, unscored };
}

export function formatTenths(tenths: number): string {
  return (tenths / 10).toFixed(1).replace(/\.0$/, "");
}

// ---------------------------------------------------------------------------
// The note on which role is best
// ---------------------------------------------------------------------------

export type PriorityVerdict = {
  /** Roles with the best total. More than one means a tie. */
  bestIds: string[];
  headline: string;
  /** Why the winner wins: the priorities it leads on, highest priority first. */
  reason: string | null;
  /** The highest-fit role, when it is not the winner and clearly fits better. */
  fitNudge: string | null;
  /** Something about the winner worth knowing before applying. */
  caution: string | null;
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function priorityVerdict(
  roles: readonly CompareRole[],
  order: readonly PriorityId[],
  result: PriorityResult
): PriorityVerdict | null {
  if (roles.length === 0 || result.roles.length === 0) return null;
  const byId = new Map(roles.map((role) => [role.id, role]));
  const best = result.roles.filter((score) => score.rank === 1);
  const bestIds = best.map((score) => score.jobId);
  const score = `${formatTenths(best[0].totalTenths)} of ${formatTenths(result.maxTenths)} points`;

  if (best.length === result.roles.length) {
    return {
      bestIds,
      headline: `These roles tie on your priorities, at ${score} each.`,
      reason: null,
      fitNudge: null,
      caution: null,
    };
  }
  if (best.length > 1) {
    const names = joinNames(best.map((entry) => roleSubject(byId.get(entry.jobId)!)));
    return {
      bestIds,
      headline: `${names} tie as the best match for your priorities, at ${score} each.`,
      reason: null,
      fitNudge: null,
      caution: null,
    };
  }

  const winner = best[0];
  const role = byId.get(winner.jobId)!;

  // Priorities where the winner earns strictly the most points, in the person's order.
  const leads = winner.priorities
    .filter((entry) => {
      if (entry.earnedTenths === null) return false;
      const others = result.roles
        .filter((other) => other !== winner)
        .map((other) => other.priorities.find((p) => p.id === entry.id)?.earnedTenths ?? 0);
      return others.every((other) => entry.earnedTenths! > other);
    })
    .slice(0, 2)
    .map((entry) => `${PRIORITIES[entry.id].label.toLowerCase()} (your #${order.indexOf(entry.id) + 1})`);

  const scoredFits = roles.filter((candidate) => candidate.fitScore !== null);
  const topFit = Math.max(...scoredFits.map((candidate) => candidate.fitScore!));
  const fitLeader = scoredFits.find((candidate) => candidate.fitScore === topFit);
  const fitNudge =
    fitLeader &&
    fitLeader.id !== role.id &&
    (role.fitScore === null || topFit - role.fitScore >= FIT_GAP_WORTH_MENTIONING)
      ? `For the best chance of hearing back, ${roleSubject(fitLeader)} fits you best (${topFit} fit vs ${role.fitScore ?? "no score"}).`
      : null;

  return {
    bestIds,
    headline: `Best for your priorities: ${roleSubject(role)}, with ${score}.`,
    reason: leads.length > 0 ? `It leads on ${joinNames(leads)}.` : null,
    fitNudge,
    caution: role.locationBlocker?.caution ?? null,
  };
}
