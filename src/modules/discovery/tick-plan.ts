export const TICK_BUDGET_MS = 90_000;
export const TICK_LEASE_MS = 4 * 60 * 1000;
export const FAST_FEED_PROVIDERS = ["remotive", "weworkremotely", "himalayas", "remoteok"] as const;
/** High-signal boards stay hot, but not on every 30-minute tick. */
export const HIGH_SIGNAL_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Enough for one Workday poll so the rotating group cannot be starved by faster boards. */
export const TICK_ROTATION_RESERVE_MS = 70_000;

const FRONTEND_HINT = /front-?end|react|ui engineer|typescript/i;
const RECENT_ACTIVITY_MS = 21 * 24 * 60 * 60 * 1000;

const PROVIDER_GAP_MS: Record<string, number> = {
  workday: 1_500,
  default: 400,
};

const PROVIDER_MAX_PER_TICK: Record<string, number> = {
  workday: 2,
  default: 12,
};

export type TickCandidate = {
  key: string;
  provider: string;
  origin: "saved" | "curated" | "feed";
  highSignal: boolean;
  lastPolledAt: Date | null;
  estimateMs: number;
};

export type TickLease = {
  owner: string | null;
  leasedUntil: Date | null;
};

export function isKnownFrontendHirer(input: { companyName: string; why?: string | null }): boolean {
  return FRONTEND_HINT.test(`${input.companyName} ${input.why ?? ""}`);
}

export function isRecentlyActive(
  input: { lastPolledAt: Date | null; lastStatus?: string | null; lastNewJobs?: number | null },
  now: Date
): boolean {
  if (!input.lastPolledAt || Number.isNaN(input.lastPolledAt.getTime())) return false;
  const age = now.getTime() - input.lastPolledAt.getTime();
  if (age < 0 || age > RECENT_ACTIVITY_MS) return false;
  if ((input.lastNewJobs ?? 0) > 0) return true;
  return input.lastStatus === "success";
}

/** Frontend hirers that are recently active, plus frontend hirers we have not polled yet. */
export function isHighSignalCurated(
  input: {
    companyName: string;
    why?: string | null;
    lastPolledAt: Date | null;
    lastStatus?: string | null;
    lastNewJobs?: number | null;
  },
  now: Date
): boolean {
  if (!isKnownFrontendHirer(input)) return false;
  if (!input.lastPolledAt) return true;
  return isRecentlyActive(input, now);
}

export function isFastFeed(provider: string): boolean {
  return (FAST_FEED_PROVIDERS as readonly string[]).includes(provider);
}

function pollTime(value: Date | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = value.getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function byOldestPoll(a: TickCandidate, b: TickCandidate): number {
  const delta = pollTime(a.lastPolledAt) - pollTime(b.lastPolledAt);
  if (delta !== 0) return delta;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function sumEstimates(items: readonly TickCandidate[]): number {
  return items.reduce((sum, item) => sum + item.estimateMs, 0);
}

function isRepollDue(lastPolledAt: Date | null, now: Date, intervalMs: number): boolean {
  if (!lastPolledAt || Number.isNaN(lastPolledAt.getTime())) return true;
  return now.getTime() - lastPolledAt.getTime() >= intervalMs;
}

function takeWithinBudget(items: readonly TickCandidate[], budgetMs: number, usedStart = 0): TickCandidate[] {
  const taken: TickCandidate[] = [];
  let used = usedStart;
  for (const item of items) {
    if (used + item.estimateMs > budgetMs) continue;
    taken.push(item);
    used += item.estimateMs;
  }
  return taken;
}

/** Stops at the first item that does not fit so a later small board cannot skip it. */
function takeUntilFull(items: readonly TickCandidate[], budgetMs: number, usedStart = 0): TickCandidate[] {
  const taken: TickCandidate[] = [];
  let used = usedStart;
  for (const item of items) {
    if (used + item.estimateMs > budgetMs) break;
    taken.push(item);
    used += item.estimateMs;
  }
  return taken;
}

/**
 * Saved boards, then due high-signal curated boards, then fast aggregator feeds,
 * then a rotating slice of everything else. A share of the budget is held back
 * for that rotating slice so high-signal boards cannot pin the cursor at 0.
 * High-signal boards are skipped until HIGH_SIGNAL_MIN_INTERVAL_MS has passed.
 * The rotation walk stops at the first board that does not fit, which keeps a
 * Workday-sized board at the cursor until a tick can afford it.
 */
export function selectTickBatch(input: {
  saved: readonly TickCandidate[];
  curated: readonly TickCandidate[];
  feeds: readonly TickCandidate[];
  cursor: number;
  budgetMs?: number;
  now?: Date;
}): { targets: TickCandidate[]; nextCursor: number } {
  const budgetMs = input.budgetMs ?? TICK_BUDGET_MS;
  const now = input.now ?? new Date();
  const dueHighSignal = input.curated
    .filter(
      (item) => item.highSignal && isRepollDue(item.lastPolledAt, now, HIGH_SIGNAL_MIN_INTERVAL_MS)
    )
    .sort(byOldestPoll);
  const stableRest = [
    ...input.curated.filter((item) => !item.highSignal),
    ...input.feeds.filter((item) => !isFastFeed(item.provider)),
  ];
  const stableCost = sumEstimates(stableRest);
  const preliminaryReserve =
    stableRest.length === 0 ? 0 : Math.min(budgetMs, TICK_ROTATION_RESERVE_MS, stableCost);
  const preliminaryPriority = budgetMs - preliminaryReserve;
  // A due high-signal Workday board never fits in the priority slice. Append it
  // after the stable rotation so the reserved share can reach it and the cursor
  // indexes for the other boards stay put.
  const oversizedDue = dueHighSignal.filter((item) => item.estimateMs > preliminaryPriority);
  const priorityHighSignal = dueHighSignal.filter((item) => item.estimateMs <= preliminaryPriority);
  const rest = [...stableRest, ...oversizedDue];
  const rotationCost = sumEstimates(rest);
  const reserve = rest.length === 0 ? 0 : Math.min(budgetMs, TICK_ROTATION_RESERVE_MS, rotationCost);
  const priorityBudget = budgetMs - reserve;

  const saved = takeWithinBudget([...input.saved].sort(byOldestPoll), priorityBudget);
  let used = sumEstimates(saved);
  const highSignal = takeWithinBudget(priorityHighSignal, priorityBudget, used);
  used += sumEstimates(highSignal);
  const fastFeeds = takeWithinBudget(
    input.feeds.filter((item) => isFastFeed(item.provider)),
    priorityBudget,
    used
  );
  used += sumEstimates(fastFeeds);

  const length = rest.length;
  const start = length === 0 ? 0 : ((input.cursor % length) + length) % length;
  const rotated = length === 0 ? [] : [...rest.slice(start), ...rest.slice(0, start)];
  const rotating = takeUntilFull(rotated, budgetMs, used);

  let nextCursor = start;
  if (length > 0 && rotating.length > 0) {
    const last = rotating[rotating.length - 1];
    const index = rest.findIndex((item) => item.key === last.key);
    nextCursor = index >= 0 ? (index + 1) % length : start;
  }

  return {
    targets: [...saved, ...highSignal, ...fastFeeds, ...rotating],
    nextCursor,
  };
}

export function acquireLease(
  current: TickLease | null,
  requester: string,
  now: Date,
  leaseMs = TICK_LEASE_MS
): { acquired: boolean; next: TickLease } {
  const held =
    current?.leasedUntil != null &&
    !Number.isNaN(current.leasedUntil.getTime()) &&
    current.leasedUntil.getTime() > now.getTime();
  if (held) {
    return {
      acquired: false,
      next: { owner: current?.owner ?? null, leasedUntil: current?.leasedUntil ?? null },
    };
  }
  return {
    acquired: true,
    next: { owner: requester, leasedUntil: new Date(now.getTime() + leaseMs) },
  };
}

export type ProviderRateState = {
  lastAt: Map<string, number>;
  counts: Map<string, number>;
};

export function emptyRateState(): ProviderRateState {
  return { lastAt: new Map(), counts: new Map() };
}

export function providerSlot(
  state: ProviderRateState,
  provider: string,
  nowMs: number
): { allowed: boolean; waitMs: number } {
  const max = PROVIDER_MAX_PER_TICK[provider] ?? PROVIDER_MAX_PER_TICK.default;
  const count = state.counts.get(provider) ?? 0;
  if (count >= max) return { allowed: false, waitMs: 0 };
  const gap = PROVIDER_GAP_MS[provider] ?? PROVIDER_GAP_MS.default;
  const last = state.lastAt.get(provider);
  const waitMs = last == null ? 0 : Math.max(0, gap - (nowMs - last));
  return { allowed: true, waitMs };
}

export function markProvider(state: ProviderRateState, provider: string, nowMs: number): void {
  state.lastAt.set(provider, nowMs);
  state.counts.set(provider, (state.counts.get(provider) ?? 0) + 1);
}

export function conditionalRequestHeaders(input: {
  etag?: string | null;
  lastModified?: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input.etag) headers["If-None-Match"] = input.etag;
  if (input.lastModified) headers["If-Modified-Since"] = input.lastModified;
  return headers;
}

export function isNotModifiedStatus(status: number): boolean {
  return status === 304;
}

export function listingNewerThanCursor<T extends { datePosted?: string | null }>(
  jobs: readonly T[],
  cursor: string | null
): T[] {
  if (!cursor) return [...jobs];
  const cursorTime = Date.parse(cursor);
  if (Number.isNaN(cursorTime)) return [...jobs];
  return jobs.filter((job) => {
    const posted = job.datePosted ? Date.parse(job.datePosted) : NaN;
    if (Number.isNaN(posted)) return true;
    return posted > cursorTime;
  });
}

export function nextSeenCursor(
  jobs: readonly { datePosted?: string | null }[],
  previous: string | null
): string | null {
  let max = previous ? Date.parse(previous) : Number.NaN;
  let maxIso = previous;
  for (const job of jobs) {
    const parsed = job.datePosted ? Date.parse(job.datePosted) : Number.NaN;
    if (!Number.isNaN(parsed) && (Number.isNaN(max) || parsed > max)) {
      max = parsed;
      maxIso = new Date(parsed).toISOString();
    }
  }
  return maxIso;
}
