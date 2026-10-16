import type { JobSourceProvider } from "@/modules/ingestion/types";
import {
  DISCOVER_BATCH_BUDGET_MS,
  EXTRA_RECIPIENT_ESTIMATE_MS,
  FAST_BOARD_ESTIMATE_MS,
  WORKDAY_BOARD_ESTIMATE_MS,
} from "@/lib/cron-discover";
import {
  CURATED_CANADA_BOARDS,
  canonicalBoardUrl,
  type CuratedBoard,
} from "@/modules/discovery/curated-boards";

export type DiscoveryRecipient = {
  userId: string;
  savedBoardId: string | null;
};

export type DiscoveryTarget = {
  key: string;
  boardUrl: string;
  provider: JobSourceProvider;
  companyName: string;
  origin: "saved" | "curated";
  recipients: DiscoveryRecipient[];
  lastPolledAt: Date | null;
};

export type SavedBoardRow = {
  id: string;
  userId: string;
  boardUrl: string;
  provider: JobSourceProvider;
  companyName: string;
  isActive?: boolean;
  lastPolledAt: Date | null;
};

export type DiscoveryUserPreference = {
  userId: string;
  includeCurated: boolean;
  excludedCuratedBoardUrls: readonly string[];
};

function pollTime(value: Date | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = value.getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export function estimateTargetMs(target: {
  provider: string;
  recipients: readonly unknown[];
}): number {
  const base = target.provider === "workday" ? WORKDAY_BOARD_ESTIMATE_MS : FAST_BOARD_ESTIMATE_MS;
  const extra = Math.max(0, target.recipients.length - 1) * EXTRA_RECIPIENT_ESTIMATE_MS;
  return base + extra;
}

export function isPolledForRun(
  lastPolledAt: Date | null | undefined,
  runStartedAt: Date
): boolean {
  if (!lastPolledAt) return false;
  const time = lastPolledAt.getTime();
  if (Number.isNaN(time)) return false;
  return time >= runStartedAt.getTime();
}

function recipientMap(rows: DiscoveryRecipient[]): DiscoveryRecipient[] {
  const byUser = new Map<string, DiscoveryRecipient>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (!existing) {
      byUser.set(row.userId, row);
      continue;
    }
    if (!existing.savedBoardId && row.savedBoardId) {
      byUser.set(row.userId, row);
    }
  }
  return [...byUser.values()];
}

function groupActiveSaved(savedBoards: readonly SavedBoardRow[]): Map<string, SavedBoardRow[]> {
  const grouped = new Map<string, SavedBoardRow[]>();
  for (const board of savedBoards) {
    if (board.isActive === false) continue;
    const key = canonicalBoardUrl(board.boardUrl);
    const list = grouped.get(key) ?? [];
    list.push(board);
    grouped.set(key, list);
  }
  return grouped;
}

function oldestPoll(rows: readonly SavedBoardRow[]): Date | null {
  let oldest: Date | null = null;
  let oldestTime = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const time = pollTime(row.lastPolledAt);
    if (time < oldestTime) {
      oldestTime = time;
      oldest = row.lastPolledAt;
    }
  }
  return oldest;
}

/**
 * One target per board URL.
 * Curated boards are shared across users. A saved board with the same URL is
 * not fetched again; that user is a recipient of the curated target.
 * Excluding a curated board skips it unless the user also follows it directly.
 */
export function buildDiscoveryTargets(input: {
  curatedBoards?: readonly CuratedBoard[];
  savedBoards: readonly SavedBoardRow[];
  users: readonly DiscoveryUserPreference[];
}): { savedTargets: DiscoveryTarget[]; curatedTargets: DiscoveryTarget[] } {
  const curatedBoards = input.curatedBoards ?? CURATED_CANADA_BOARDS;
  const savedByUrl = groupActiveSaved(input.savedBoards);
  const includeByUser = new Map(input.users.map((user) => [user.userId, user.includeCurated]));
  const excludedByUser = new Map(
    input.users.map((user) => [
      user.userId,
      new Set(user.excludedCuratedBoardUrls.map((url) => canonicalBoardUrl(url))),
    ])
  );

  const curatedTargets: DiscoveryTarget[] = [];
  const curatedKeys = new Set<string>();

  for (const board of curatedBoards) {
    const key = canonicalBoardUrl(board.boardUrl);
    curatedKeys.add(key);
    const saved = savedByUrl.get(key) ?? [];
    const recipients: DiscoveryRecipient[] = [];

    for (const user of input.users) {
      if (!user.includeCurated) continue;
      if (excludedByUser.get(user.userId)?.has(key)) continue;
      const savedRow = saved.find((row) => row.userId === user.userId);
      recipients.push({ userId: user.userId, savedBoardId: savedRow?.id ?? null });
    }

    for (const row of saved) {
      if (includeByUser.get(row.userId) === false) {
        recipients.push({ userId: row.userId, savedBoardId: row.id });
        continue;
      }
      const excluded = excludedByUser.get(row.userId)?.has(key) ?? false;
      if (excluded || !includeByUser.has(row.userId)) {
        recipients.push({ userId: row.userId, savedBoardId: row.id });
      }
    }

    const unique = recipientMap(recipients);
    if (unique.length === 0) continue;
    curatedTargets.push({
      key,
      boardUrl: board.boardUrl,
      provider: board.provider,
      companyName: board.companyName,
      origin: "curated",
      recipients: unique,
      lastPolledAt: oldestPoll(saved),
    });
  }

  const savedTargets: DiscoveryTarget[] = [];
  for (const [key, rows] of savedByUrl) {
    if (curatedKeys.has(key)) continue;
    const sample = rows[0];
    savedTargets.push({
      key,
      boardUrl: sample.boardUrl,
      provider: sample.provider,
      companyName: sample.companyName,
      origin: "saved",
      recipients: rows.map((row) => ({ userId: row.userId, savedBoardId: row.id })),
      lastPolledAt: oldestPoll(rows),
    });
  }

  savedTargets.sort((a, b) => {
    const delta = pollTime(a.lastPolledAt) - pollTime(b.lastPolledAt);
    if (delta !== 0) return delta;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return { savedTargets, curatedTargets };
}

export function savedTargetsWithinCap(
  savedTargets: readonly DiscoveryTarget[],
  savedLastPolledAt: ReadonlyMap<string, Date | null>,
  runStartedAt: Date,
  savedBoardLimit: number
): DiscoveryTarget[] {
  const doneCount = savedTargets.filter((target) =>
    target.recipients.every((recipient) =>
      recipient.savedBoardId
        ? isPolledForRun(savedLastPolledAt.get(recipient.savedBoardId), runStartedAt)
        : false
    )
  ).length;
  const room = Math.max(0, savedBoardLimit - doneCount);
  const pending = savedTargets.filter(
    (target) =>
      !target.recipients.every((recipient) =>
        recipient.savedBoardId
          ? isPolledForRun(savedLastPolledAt.get(recipient.savedBoardId), runStartedAt)
          : false
      )
  );
  return pending.slice(0, room);
}

function takeWithinBudget<T extends { provider: string; recipients: readonly unknown[] }>(
  items: readonly T[],
  budgetMs: number,
  startUsed = 0
): { taken: T[]; used: number; stoppedEarly: boolean } {
  const taken: T[] = [];
  let used = startUsed;
  for (const item of items) {
    const cost = estimateTargetMs(item);
    if (taken.length > 0 && used + cost > budgetMs) {
      return { taken, used, stoppedEarly: true };
    }
    taken.push(item);
    used += cost;
    if (used >= budgetMs) return { taken, used, stoppedEarly: true };
  }
  return { taken, used, stoppedEarly: false };
}

export type DiscoveryBatchSelection = {
  targets: DiscoveryTarget[];
  nextCuratedCursor: number;
  done: boolean;
};

/**
 * Saved boards first, then curated boards.
 * When the shared poll table is available, curated progress is "already polled
 * this run" and the cursor stays at 0. Without that table, the cursor walks
 * the curated list so a batch cannot repeat itself.
 */
export function selectDiscoveryBatch(input: {
  savedTargets: readonly DiscoveryTarget[];
  curatedTargets: readonly DiscoveryTarget[];
  curatedCursor: number;
  curatedDone: ReadonlySet<string>;
  useCuratedCursor: boolean;
  budgetMs?: number;
}): DiscoveryBatchSelection {
  const budgetMs = input.budgetMs ?? DISCOVER_BATCH_BUDGET_MS;
  const saved = takeWithinBudget(input.savedTargets, budgetMs);
  if (saved.stoppedEarly) {
    return {
      targets: saved.taken,
      nextCuratedCursor: Math.max(0, input.curatedCursor),
      done: false,
    };
  }

  const start = input.useCuratedCursor ? Math.max(0, input.curatedCursor) : 0;
  const pending: DiscoveryTarget[] = [];
  let index = start;
  for (; index < input.curatedTargets.length; index += 1) {
    const target = input.curatedTargets[index];
    if (input.curatedDone.has(target.key)) continue;
    pending.push(target);
  }

  const curated = takeWithinBudget(pending, budgetMs, saved.used);
  let consumed = 0;
  let cursor = start;
  if (input.useCuratedCursor && curated.taken.length > 0) {
    for (const target of input.curatedTargets.slice(start)) {
      cursor += 1;
      if (!input.curatedDone.has(target.key)) consumed += 1;
      if (consumed >= curated.taken.length) break;
    }
  }

  const targets = [...saved.taken, ...curated.taken];
  const curatedFinished =
    pending.length === 0 ||
    (input.useCuratedCursor ? cursor >= input.curatedTargets.length : pending.length === curated.taken.length);
  const done = targets.length === 0 || (!saved.stoppedEarly && curatedFinished);

  return {
    targets,
    nextCuratedCursor: input.useCuratedCursor ? cursor : 0,
    done,
  };
}
