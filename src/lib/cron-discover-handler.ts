import { eq } from "drizzle-orm";
import { CRON_MATCH_CONCURRENCY, CRON_MAX_BOARDS_PER_RUN, CRON_MAX_NEW_JOBS_PER_RUN, CRON_BOARD_DELAY_MS, sleep } from "@/lib/cron-discover";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getDb } from "@/db/client";
import { curatedBoardPollState, savedBoards } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import { CURATED_CANADA_BOARDS, canonicalBoardUrl, type CuratedBoard } from "@/modules/discovery/curated-boards";
import {
  buildDiscoveryTargets,
  isPolledForRun,
  savedTargetsWithinCap,
  selectDiscoveryBatch,
  type DiscoveryTarget,
  type DiscoveryUserPreference,
  type SavedBoardRow,
} from "@/modules/discovery/discovery-batch";
import { aggregateDiscoverStats, fetchBoardListing, pollBoardsForUser } from "@/modules/discovery/poll-board";
import { processMatchQueue } from "@/modules/matching/match-queue";
import type { JobSourceProvider } from "@/modules/ingestion/types";
import { runWithPerfContextAsync } from "@/lib/performance/request-context";
import { listDigestUserIds } from "@/modules/digest/recipients";
import {
  isMissingDatabaseRelation,
  isMissingSearchPreferenceColumn,
} from "@/modules/matching/load-search-preferences";
import type { DiscoverContinuation } from "@/lib/cron-discover-kick";

/** One hop per board plus the saved-board cap, with a few spare hops. */
export const MAX_DISCOVER_HOPS = CURATED_CANADA_BOARDS.length + CRON_MAX_BOARDS_PER_RUN + 5;

export type DiscoverBatchOptions = {
  cursor?: number;
  hop?: number;
  runStartedAt?: Date;
  curatedBoards?: readonly CuratedBoard[];
  budgetMs?: number;
};

export type DiscoverBatchResult = ReturnType<typeof aggregateDiscoverStats> & {
  cursor: number;
  hop: number;
  runStartedAt: string;
  nextCursor: number | null;
  continuation: DiscoverContinuation | null;
};

type PreferenceSnapshot = {
  include: boolean;
  excluded: string[];
};

function emptyResult(options: {
  cursor: number;
  hop: number;
  runStartedAt: Date;
}): DiscoverBatchResult {
  return {
    ...aggregateDiscoverStats([], { newJobs: 0, skipped: 0, matched: 0, filtered: 0 }),
    cursor: options.cursor,
    hop: options.hop,
    runStartedAt: options.runStartedAt.toISOString(),
    nextCursor: null,
    continuation: null,
  };
}

async function loadSavedBoards(db: ReturnType<typeof getDb>): Promise<SavedBoardRow[]> {
  const rows = await db.query.savedBoards.findMany({
    where: eq(savedBoards.isActive, true),
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    boardUrl: row.boardUrl,
    provider: row.provider as JobSourceProvider,
    companyName: row.companyName,
    isActive: row.isActive,
    lastPolledAt: row.lastPolledAt,
  }));
}

async function loadPreferences(db: ReturnType<typeof getDb>): Promise<Map<string, PreferenceSnapshot>> {
  const table = db.query.searchPreferences;
  if (!table?.findMany) return new Map();

  const toMap = (
    rows: Array<{
      userId: string;
      discoverCuratedBoards: boolean;
      excludedCuratedBoardUrls?: string[] | null;
    }>
  ) => {
    const map = new Map<string, PreferenceSnapshot>();
    for (const row of rows) {
      map.set(row.userId, {
        include: row.discoverCuratedBoards,
        excluded: Array.isArray(row.excludedCuratedBoardUrls) ? row.excludedCuratedBoardUrls : [],
      });
    }
    return map;
  };

  try {
    const rows = await table.findMany({
      columns: {
        userId: true,
        discoverCuratedBoards: true,
        excludedCuratedBoardUrls: true,
      },
    });
    return toMap(rows);
  } catch (error) {
    if (isMissingDatabaseRelation(error, "search_preferences")) return new Map();
    if (!isMissingSearchPreferenceColumn(error, "excluded_curated_board_urls")) throw error;
    const rows = await table.findMany({
      columns: {
        userId: true,
        discoverCuratedBoards: true,
      },
    });
    return toMap(rows);
  }
}

async function loadCuratedPollState(db: ReturnType<typeof getDb>): Promise<{
  available: boolean;
  byUrl: Map<string, Date | null>;
}> {
  const table = db.query.curatedBoardPollState;
  if (!table?.findMany) return { available: false, byUrl: new Map() };
  try {
    const rows = await table.findMany({
      columns: { boardUrl: true, lastPolledAt: true },
    });
    const byUrl = new Map<string, Date | null>();
    for (const row of rows) {
      byUrl.set(canonicalBoardUrl(row.boardUrl), row.lastPolledAt ?? null);
    }
    return { available: true, byUrl };
  } catch (error) {
    if (!isMissingDatabaseRelation(error, "curated_board_poll_state")) {
      console.error("[cron] curated poll state unavailable; using a cursor", error);
    }
    return { available: false, byUrl: new Map() };
  }
}

async function listKnownUserIds(db: ReturnType<typeof getDb>, saved: readonly SavedBoardRow[]): Promise<Set<string>> {
  const ids = new Set<string>();
  if (typeof db.execute === "function") {
    try {
      for (const userId of await listDigestUserIds(db)) ids.add(userId);
    } catch (error) {
      console.error("[cron] discovery user list failed", error);
    }
  }
  for (const board of saved) ids.add(board.userId);
  return ids;
}

function usersFromPreferences(
  ids: Iterable<string>,
  preferences: Map<string, PreferenceSnapshot>
): DiscoveryUserPreference[] {
  return [...ids].map((userId) => {
    const pref = preferences.get(userId);
    if (!pref) {
      return { userId, includeCurated: true, excludedCuratedBoardUrls: [] };
    }
    return {
      userId,
      includeCurated: pref.include,
      excludedCuratedBoardUrls: pref.excluded,
    };
  });
}

async function stampSavedBoardsAttempted(
  db: ReturnType<typeof getDb>,
  target: DiscoveryTarget
): Promise<void> {
  if (typeof db.update !== "function") return;
  for (const recipient of target.recipients) {
    if (!recipient.savedBoardId) continue;
    try {
      await db
        .update(savedBoards)
        .set({ lastPolledAt: new Date() })
        .where(eq(savedBoards.id, recipient.savedBoardId));
    } catch (error) {
      console.error(`[cron] failed to record poll time boardId=${recipient.savedBoardId}`, error);
    }
  }
}

async function stampCuratedBoard(
  db: ReturnType<typeof getDb>,
  target: DiscoveryTarget,
  status: "success" | "error",
  runId: string
): Promise<void> {
  if (typeof db.insert !== "function") return;
  const now = new Date();
  try {
    await db
      .insert(curatedBoardPollState)
      .values({
        boardUrl: target.key,
        provider: target.provider,
        companyName: target.companyName,
        lastPolledAt: now,
        lastStatus: status,
        lastRunId: runId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: curatedBoardPollState.boardUrl,
        set: {
          provider: target.provider,
          companyName: target.companyName,
          lastPolledAt: now,
          lastStatus: status,
          lastRunId: runId,
          updatedAt: now,
        },
      });
  } catch (error) {
    if (!isMissingDatabaseRelation(error, "curated_board_poll_state")) {
      console.error(`[cron] failed to stamp curated board ${target.key}`, error);
    }
  }
}

export async function runDiscoverBatch(options: DiscoverBatchOptions = {}): Promise<DiscoverBatchResult> {
  const runStartedAt = options.runStartedAt ?? new Date();
  const hop = options.hop ?? 0;
  const cursor = options.cursor ?? 0;
  if (hop >= MAX_DISCOVER_HOPS) {
    console.error("[cron] discover hop limit reached", { hop });
    return emptyResult({ cursor, hop, runStartedAt });
  }

  const db = getDb();
  const saved = await loadSavedBoards(db);
  const preferences = await loadPreferences(db);
  const state = await loadCuratedPollState(db);
  const userIds = await listKnownUserIds(db, saved);
  const users = usersFromPreferences(userIds, preferences);
  const { savedTargets, curatedTargets } = buildDiscoveryTargets({
    curatedBoards: options.curatedBoards,
    savedBoards: saved,
    users,
  });

  const savedLastPolledAt = new Map(saved.map((board) => [board.id, board.lastPolledAt]));
  const pendingSaved = savedTargetsWithinCap(
    savedTargets,
    savedLastPolledAt,
    runStartedAt,
    CRON_MAX_BOARDS_PER_RUN
  );
  const curatedDone = new Set<string>();
  if (state.available) {
    for (const target of curatedTargets) {
      if (isPolledForRun(state.byUrl.get(target.key), runStartedAt)) curatedDone.add(target.key);
    }
  }

  const selection = selectDiscoveryBatch({
    savedTargets: pendingSaved,
    curatedTargets,
    curatedCursor: cursor,
    curatedDone,
    useCuratedCursor: !state.available,
    budgetMs: options.budgetMs,
  });

  const boardResults: Array<{ status: "success" | "error" }> = [];
  const totals = { newJobs: 0, skipped: 0, matched: 0, filtered: 0 };
  const capsByUser = new Map<string, { remainingNewJobs: number }>();
  const queuedByUser = new Map<string, number>();

  for (let index = 0; index < selection.targets.length; index += 1) {
    const target = selection.targets[index];
    let status: "success" | "error" = "success";
    try {
      // One HTTP fetch per board. User imports stay sequential on the shared pool.
      const listing = await fetchBoardListing(target);
      for (const recipient of target.recipients) {
        const caps = capsByUser.get(recipient.userId) ?? {
          remainingNewJobs: CRON_MAX_NEW_JOBS_PER_RUN,
        };
        capsByUser.set(recipient.userId, caps);
        if (caps.remainingNewJobs <= 0) continue;

        const { results, stats } = await withUserDb(recipient.userId, (userDb) =>
          pollBoardsForUser(
            userDb,
            recipient.userId,
            [
              {
                id: recipient.savedBoardId ?? `curated:${target.key}`,
                boardUrl: listing.boardUrl,
                provider: target.provider,
                companyName: target.companyName,
                listing,
              },
            ],
            caps,
            { trackSavedBoard: Boolean(recipient.savedBoardId) }
          )
        );
        if (results.some((result) => result.status === "error")) status = "error";
        totals.newJobs += stats.newJobs;
        totals.skipped += stats.skipped;
        totals.filtered += stats.filtered;
        queuedByUser.set(recipient.userId, (queuedByUser.get(recipient.userId) ?? 0) + stats.queuedForMatch);
      }
    } catch (error) {
      status = "error";
      console.error(`[cron] board poll failed ${target.boardUrl}`, error);
    }

    boardResults.push({ status });
    if (status === "error") {
      await stampSavedBoardsAttempted(db, target);
    }
    if (target.origin === "curated") {
      await stampCuratedBoard(db, target, status, runStartedAt.toISOString());
    }

    if (index < selection.targets.length - 1 && process.env.VITEST !== "true") {
      await sleep(CRON_BOARD_DELAY_MS);
    }
  }

  for (const [userId, queued] of queuedByUser) {
    if (queued <= 0) continue;
    const matchStats = await withUserDb(userId, (userDb) =>
      processMatchQueue(userDb, userId, {
        limit: queued,
        concurrency: CRON_MATCH_CONCURRENCY,
      })
    );
    totals.matched += matchStats.processed;
  }

  const summary = aggregateDiscoverStats(boardResults, totals);
  const continueRun = !selection.done && selection.targets.length > 0 && hop + 1 < MAX_DISCOVER_HOPS;
  const continuation: DiscoverContinuation | null = continueRun
    ? {
        cursor: selection.nextCuratedCursor,
        hop: hop + 1,
        runStartedAt: runStartedAt.toISOString(),
      }
    : null;

  console.info("[cron] discover batch", {
    hop,
    polled: summary.polled,
    newJobs: summary.newJobs,
    nextCursor: continuation?.cursor ?? null,
    done: selection.done,
  });

  return {
    ...summary,
    cursor,
    hop,
    runStartedAt: runStartedAt.toISOString(),
    nextCursor: continuation?.cursor ?? null,
    continuation,
  };
}

export async function runCronDiscoverPoll(options?: DiscoverBatchOptions) {
  return runWithPerfContextAsync("cron.discover", async () => runDiscoverBatch(options));
}

export async function handleCronDiscoverRequest(
  authHeader: string | null,
  options?: DiscoverBatchOptions
): Promise<{ status: number; body: Record<string, unknown> }> {
  const auth = verifyCronAuth(authHeader);
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  const summary = await runCronDiscoverPoll(options);
  return { status: 200, body: summary };
}
