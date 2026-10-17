import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { curatedBoardPollState, savedBoards } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import { CRON_MATCH_CONCURRENCY } from "@/lib/cron-discover";
import { CURATED_CANADA_BOARDS, canonicalBoardUrl } from "@/modules/discovery/curated-boards";
import {
  buildDiscoveryTargets,
  estimateTargetMs,
  type DiscoveryTarget,
  type DiscoveryUserPreference,
  type SavedBoardRow,
} from "@/modules/discovery/discovery-batch";

type TickSavedBoard = SavedBoardRow & {
  httpEtag: string | null;
  httpLastModified: string | null;
  lastSeenCursor: string | null;
};
import { configuredDiscoveryFeeds } from "@/modules/discovery/source-catalog";
import { fetchBoardListing, pollBoardsForUser } from "@/modules/discovery/poll-board";
import {
  TICK_BUDGET_MS,
  TICK_LEASE_MS,
  emptyRateState,
  isHighSignalCurated,
  listingNewerThanCursor,
  markProvider,
  nextSeenCursor,
  providerSlot,
  selectTickBatch,
  type TickCandidate,
} from "@/modules/discovery/tick-plan";
import { dispatchInstantAlerts } from "@/modules/alerts/dispatch";
import { listDigestUserIds } from "@/modules/digest/recipients";
import { isMissingDatabaseRelation } from "@/modules/matching/load-search-preferences";
import { processMatchQueue } from "@/modules/matching/match-queue";
import { drainProfileRescore } from "@/modules/matching/profile-rescore";
import type { JobSourceProvider } from "@/modules/ingestion/types";
import { runWithPerfContextAsync } from "@/lib/performance/request-context";

export type DiscoveryTickResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  polled: number;
  notModified: number;
  newJobs: number;
  matched: number;
  alertsSent: number;
  alertsQueued: number;
  cursor: number;
};

type PollMemory = {
  etag: string | null;
  lastModified: string | null;
  lastSeenCursor: string | null;
  lastPolledAt: Date | null;
  lastStatus: string | null;
  lastNewJobs: number | null;
};

function emptyResult(extra: Partial<DiscoveryTickResult> = {}): DiscoveryTickResult {
  return {
    ok: true,
    polled: 0,
    notModified: 0,
    newJobs: 0,
    matched: 0,
    alertsSent: 0,
    alertsQueued: 0,
    cursor: 0,
    ...extra,
  };
}

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Array<Record<string, unknown>>;
  }
  return [];
}

/** postgres.js bind calls Buffer.byteLength on each parameter. A Date throws there. */
function sqlTimestamp(value: Date): string {
  return value.toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

async function tryAcquireLease(
  db: ReturnType<typeof getDb>,
  owner: string,
  now: Date
): Promise<{ acquired: boolean; cursor: number }> {
  const until = new Date(now.getTime() + TICK_LEASE_MS);
  const result = await db.execute(sql`
    INSERT INTO discovery_tick_lock (id, owner, leased_until, cursor, updated_at)
    VALUES ('discovery', ${owner}, ${sqlTimestamp(until)}, 0, ${sqlTimestamp(now)})
    ON CONFLICT (id) DO UPDATE
      SET owner = EXCLUDED.owner,
          leased_until = EXCLUDED.leased_until,
          updated_at = EXCLUDED.updated_at
    WHERE discovery_tick_lock.leased_until IS NULL
       OR discovery_tick_lock.leased_until <= ${sqlTimestamp(now)}
    RETURNING cursor
  `);
  const rows = rowsFrom(result);
  if (rows.length === 0) return { acquired: false, cursor: 0 };
  const cursor = Number(rows[0]?.cursor ?? 0);
  return { acquired: true, cursor: Number.isFinite(cursor) ? cursor : 0 };
}

async function releaseLease(
  db: ReturnType<typeof getDb>,
  owner: string,
  cursor: number,
  now: Date
): Promise<void> {
  await db.execute(sql`
    UPDATE discovery_tick_lock
    SET leased_until = ${sqlTimestamp(now)},
        cursor = ${cursor},
        updated_at = ${sqlTimestamp(now)}
    WHERE id = 'discovery' AND owner = ${owner}
  `);
}

export async function runDiscoveryTick(options?: { now?: Date; budgetMs?: number }): Promise<DiscoveryTickResult> {
  return runWithPerfContextAsync("discovery.tick", async () => {
    const now = options?.now ?? new Date();
    const budgetMs = options?.budgetMs ?? TICK_BUDGET_MS;
    const started = Date.now();
    const db = getDb();
    const owner = randomUUID();
    let cursor = 0;
    let acquired = false;
    try {
      const lease = await tryAcquireLease(db, owner, now);
      if (!lease.acquired) {
        return emptyResult({ skipped: true, reason: "locked" });
      }
      acquired = true;
      cursor = lease.cursor;
      const summary = await runTickBody(db, { now, budgetMs, started, cursor });
      cursor = summary.cursor;
      return summary;
    } catch (error) {
      const message = errorMessage(error);
      if (isMissingDatabaseRelation(error, "discovery_tick_lock")) {
        console.error(`[discovery-tick] apply migration 0023 before scheduling the tick: ${message}`);
        return emptyResult({ ok: false, reason: "migration_0023_required" });
      }
      console.error(`[discovery-tick] failed: ${message}`);
      return emptyResult({ ok: false, reason: "failed", cursor });
    } finally {
      if (acquired) {
        try {
          await releaseLease(db, owner, cursor, new Date());
        } catch (error) {
          console.error("[discovery-tick] failed to release lease", error);
        }
      }
    }
  });
}

async function runTickBody(
  db: ReturnType<typeof getDb>,
  input: { now: Date; budgetMs: number; started: number; cursor: number }
): Promise<DiscoveryTickResult> {
  const saved = await loadSavedBoards(db);
  const preferences = await loadPreferences(db);
  const pollState = await loadPollState(db);
  const userIds = await listKnownUserIds(db, saved);
  const users = usersFromPreferences(userIds, preferences);
  const { savedTargets, curatedTargets } = buildDiscoveryTargets({
    savedBoards: saved,
    users,
    feeds: configuredDiscoveryFeeds(),
  });
  const whyByUrl = new Map(
    CURATED_CANADA_BOARDS.map((board) => [canonicalBoardUrl(board.boardUrl), board.why])
  );

  const savedCandidates = savedTargets.map((target) => toCandidate(target, pollState, whyByUrl, input.now, false));
  const boardCandidates: TickCandidate[] = [];
  const feedCandidates: TickCandidate[] = [];
  for (const target of curatedTargets) {
    const feed = target.key.startsWith("feed:");
    const candidate = toCandidate(target, pollState, whyByUrl, input.now, !feed);
    if (feed) feedCandidates.push(candidate);
    else boardCandidates.push(candidate);
  }

  const selection = selectTickBatch({
    saved: savedCandidates,
    curated: boardCandidates,
    feeds: feedCandidates,
    cursor: input.cursor,
    budgetMs: input.budgetMs,
  });
  const byKey = new Map<string, DiscoveryTarget>(
    [...savedTargets, ...curatedTargets].map((target) => [target.key, target])
  );
  const rates = emptyRateState();
  const totals = emptyResult({ cursor: input.cursor });
  const newJobsByUser = new Map<string, string[]>();
  const queuedByUser = new Map<string, number>();
  let finished = true;

  for (const candidate of selection.targets) {
    if (Date.now() - input.started > input.budgetMs) {
      finished = false;
      break;
    }
    const target = byKey.get(candidate.key);
    if (!target) continue;
    const slot = providerSlot(rates, candidate.provider, Date.now());
    if (!slot.allowed) continue;
    if (slot.waitMs > 0 && process.env.VITEST !== "true") {
      await new Promise((resolve) => setTimeout(resolve, slot.waitMs));
    }
    markProvider(rates, candidate.provider, Date.now());

    const memory = memoryFor(target, saved, pollState);
    let status: "success" | "error" = "success";
    let newJobs = 0;
    try {
      const listing = await fetchBoardListing(
        {
          boardUrl: target.boardUrl,
          provider: target.provider,
          companyName: target.companyName,
        },
        { etag: memory.etag, lastModified: memory.lastModified }
      );
      totals.polled += 1;
      if (listing.notModified) {
        totals.notModified += 1;
        await stampTarget(db, target, saved, {
          status: "success",
          etag: listing.etag ?? memory.etag,
          lastModified: listing.lastModified ?? memory.lastModified,
          lastSeenCursor: memory.lastSeenCursor,
          newJobs: 0,
          runId: input.now.toISOString(),
        });
        continue;
      }

      const fresh = listingNewerThanCursor(listing.jobs, memory.lastSeenCursor);
      const seen = nextSeenCursor(listing.jobs, memory.lastSeenCursor);
      for (const recipient of target.recipients) {
        const { stats } = await withUserDb(recipient.userId, (userDb) =>
          pollBoardsForUser(
            userDb,
            recipient.userId,
            [
              {
                id: recipient.savedBoardId ?? `curated:${target.key}`,
                boardUrl: listing.boardUrl,
                provider: target.provider,
                companyName: target.companyName,
                listing: { boardUrl: listing.boardUrl, jobs: fresh },
              },
            ],
            { remainingNewJobs: 25 },
            { trackSavedBoard: Boolean(recipient.savedBoardId) }
          )
        );
        newJobs += stats.newJobs;
        totals.newJobs += stats.newJobs;
        const bucket = newJobsByUser.get(recipient.userId) ?? [];
        bucket.push(...stats.newJobIds);
        newJobsByUser.set(recipient.userId, bucket);
        queuedByUser.set(recipient.userId, (queuedByUser.get(recipient.userId) ?? 0) + stats.queuedForMatch);
      }
      await stampTarget(db, target, saved, {
        status: "success",
        etag: listing.etag,
        lastModified: listing.lastModified,
        lastSeenCursor: seen,
        newJobs,
        runId: input.now.toISOString(),
      });
    } catch (error) {
      status = "error";
      console.error(`[discovery-tick] ${target.boardUrl} failed`, error);
      await stampTarget(db, target, saved, {
        status,
        etag: memory.etag,
        lastModified: memory.lastModified,
        lastSeenCursor: memory.lastSeenCursor,
        newJobs: 0,
        runId: input.now.toISOString(),
      });
    }
  }

  for (const [userId, queued] of queuedByUser) {
    if (queued <= 0) continue;
    if (Date.now() - input.started > input.budgetMs) break;
    const matchStats = await withUserDb(userId, (userDb) =>
      processMatchQueue(userDb, userId, { limit: queued, concurrency: CRON_MATCH_CONCURRENCY })
    );
    totals.matched += matchStats.processed;
  }

  const alertUsers = new Set<string>([...newJobsByUser.keys(), ...userIds]);
  for (const userId of alertUsers) {
    if (Date.now() - input.started > input.budgetMs) break;
    try {
      const alerts = await dispatchInstantAlerts({
        userId,
        newJobIds: newJobsByUser.get(userId) ?? [],
        now: new Date(),
      });
      totals.alertsSent += alerts.sent;
      totals.alertsQueued += alerts.queued;
    } catch (error) {
      console.error(`[discovery-tick] alerts failed userId=${userId}`, error);
    }
  }

  for (const userId of userIds) {
    if (Date.now() - input.started > input.budgetMs) break;
    try {
      await drainProfileRescore(userId, { limit: 5, budgetMs: 8_000 });
    } catch (error) {
      console.error(`[discovery-tick] rescore drain failed userId=${userId}`, error);
    }
  }

  totals.cursor = finished ? selection.nextCursor : input.cursor;
  return totals;
}

function toCandidate(
  target: DiscoveryTarget,
  pollState: Map<string, PollMemory>,
  whyByUrl: Map<string, string>,
  now: Date,
  curatedBoard: boolean
): TickCandidate {
  const memory = pollState.get(target.key);
  const lastPolledAt = target.lastPolledAt ?? memory?.lastPolledAt ?? null;
  return {
    key: target.key,
    provider: target.provider,
    origin: target.key.startsWith("feed:") ? "feed" : target.origin,
    highSignal: curatedBoard
      ? isHighSignalCurated(
          {
            companyName: target.companyName,
            why: whyByUrl.get(target.key) ?? null,
            lastPolledAt: memory?.lastPolledAt ?? null,
            lastStatus: memory?.lastStatus,
            lastNewJobs: memory?.lastNewJobs,
          },
          now
        )
      : false,
    lastPolledAt,
    estimateMs: estimateTargetMs(target),
  };
}

function memoryFor(
  target: DiscoveryTarget,
  saved: readonly TickSavedBoard[],
  pollState: Map<string, PollMemory>
): PollMemory {
  const shared = pollState.get(target.key);
  const savedRow = saved.find((board) => board.id === target.recipients.find((row) => row.savedBoardId)?.savedBoardId);
  return {
    etag: savedRow?.httpEtag ?? shared?.etag ?? null,
    lastModified: savedRow?.httpLastModified ?? shared?.lastModified ?? null,
    lastSeenCursor: savedRow?.lastSeenCursor ?? shared?.lastSeenCursor ?? null,
    lastPolledAt: shared?.lastPolledAt ?? null,
    lastStatus: shared?.lastStatus ?? null,
    lastNewJobs: shared?.lastNewJobs ?? null,
  };
}

async function stampTarget(
  db: ReturnType<typeof getDb>,
  target: DiscoveryTarget,
  saved: readonly SavedBoardRow[],
  patch: {
    status: "success" | "error";
    etag: string | null;
    lastModified: string | null;
    lastSeenCursor: string | null;
    newJobs: number;
    runId: string;
  }
): Promise<void> {
  const now = new Date();
  if (target.origin === "curated" || target.key.startsWith("feed:")) {
    try {
      await db
        .insert(curatedBoardPollState)
        .values({
          boardUrl: target.key,
          provider: target.provider,
          companyName: target.companyName,
          lastPolledAt: now,
          lastStatus: patch.status,
          lastRunId: patch.runId,
          httpEtag: patch.etag,
          httpLastModified: patch.lastModified,
          lastSeenCursor: patch.lastSeenCursor,
          lastNewJobs: patch.newJobs,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: curatedBoardPollState.boardUrl,
          set: {
            provider: target.provider,
            companyName: target.companyName,
            lastPolledAt: now,
            lastStatus: patch.status,
            lastRunId: patch.runId,
            httpEtag: patch.etag,
            httpLastModified: patch.lastModified,
            lastSeenCursor: patch.lastSeenCursor,
            lastNewJobs: patch.newJobs,
            updatedAt: now,
          },
        });
    } catch (error) {
      if (!isMissingDatabaseRelation(error, "curated_board_poll_state")) {
        console.error(`[discovery-tick] stamp failed ${target.key}`, error);
      }
    }
  }

  for (const recipient of target.recipients) {
    if (!recipient.savedBoardId) continue;
    if (!saved.some((board) => board.id === recipient.savedBoardId)) continue;
    try {
      await db
        .update(savedBoards)
        .set({
          lastPolledAt: now,
          httpEtag: patch.etag,
          httpLastModified: patch.lastModified,
          lastSeenCursor: patch.lastSeenCursor,
        })
        .where(eq(savedBoards.id, recipient.savedBoardId));
    } catch (error) {
      console.error(`[discovery-tick] saved board stamp failed ${recipient.savedBoardId}`, error);
    }
  }
}

async function loadSavedBoards(db: ReturnType<typeof getDb>): Promise<TickSavedBoard[]> {
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
    httpEtag: row.httpEtag ?? null,
    httpLastModified: row.httpLastModified ?? null,
    lastSeenCursor: row.lastSeenCursor ?? null,
  }));
}

async function loadPreferences(db: ReturnType<typeof getDb>): Promise<Map<string, DiscoveryUserPreference>> {
  const table = db.query.searchPreferences;
  if (!table?.findMany) return new Map();
  try {
    const rows = await table.findMany({
      columns: {
        userId: true,
        discoverCuratedBoards: true,
        excludedCuratedBoardUrls: true,
        enabledDiscoverySources: true,
      },
    });
    const map = new Map<string, DiscoveryUserPreference>();
    for (const row of rows) {
      map.set(row.userId, {
        userId: row.userId,
        includeCurated: row.discoverCuratedBoards,
        excludedCuratedBoardUrls: Array.isArray(row.excludedCuratedBoardUrls) ? row.excludedCuratedBoardUrls : [],
        enabledDiscoverySources: row.enabledDiscoverySources ?? null,
      });
    }
    return map;
  } catch (error) {
    console.error("[discovery-tick] preferences unavailable", error);
    return new Map();
  }
}

async function loadPollState(db: ReturnType<typeof getDb>): Promise<Map<string, PollMemory>> {
  const map = new Map<string, PollMemory>();
  try {
    const rows = await db.query.curatedBoardPollState.findMany();
    for (const row of rows) {
      map.set(canonicalBoardUrl(row.boardUrl), {
        etag: row.httpEtag ?? null,
        lastModified: row.httpLastModified ?? null,
        lastSeenCursor: row.lastSeenCursor ?? null,
        lastPolledAt: row.lastPolledAt,
        lastStatus: row.lastStatus,
        lastNewJobs: row.lastNewJobs,
      });
      if (row.boardUrl.startsWith("feed:")) {
        map.set(row.boardUrl, {
          etag: row.httpEtag ?? null,
          lastModified: row.httpLastModified ?? null,
          lastSeenCursor: row.lastSeenCursor ?? null,
          lastPolledAt: row.lastPolledAt,
          lastStatus: row.lastStatus,
          lastNewJobs: row.lastNewJobs,
        });
      }
    }
  } catch (error) {
    if (!isMissingDatabaseRelation(error, "curated_board_poll_state")) {
      console.error("[discovery-tick] poll state unavailable", error);
    }
  }
  return map;
}

async function listKnownUserIds(db: ReturnType<typeof getDb>, saved: readonly SavedBoardRow[]): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    for (const userId of await listDigestUserIds(db)) ids.add(userId);
  } catch (error) {
    console.error("[discovery-tick] user list failed", error);
  }
  for (const board of saved) ids.add(board.userId);
  return ids;
}

function usersFromPreferences(
  ids: Iterable<string>,
  preferences: Map<string, DiscoveryUserPreference>
): DiscoveryUserPreference[] {
  return [...ids].map((userId) => {
    const pref = preferences.get(userId);
    if (!pref) return { userId, includeCurated: true, excludedCuratedBoardUrls: [] };
    return pref;
  });
}
