import { eq } from "drizzle-orm";
import { savedBoards, candidateProfiles } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { normalizeBoardUrl } from "@/modules/ingestion/board-url";
import {
  detectBestAdapter,
  getAdapterForProvider,
} from "@/modules/ingestion/adapters";
import type { JobSourceProvider, NormalizedJob } from "@/modules/ingestion/types";
import { normalizeBoardJobs } from "@/modules/ingestion/board-normalize";
import {
  fetchWorkdayJobDetail,
  workdayLocationNeedsDetail,
} from "@/modules/ingestion/workday";
import { findExistingJob, persistDiscoveredJob } from "@/modules/ingestion/persist-job";
import {
  matchesDiscoveredJobTitle,
  shouldImportDiscoveredJob,
} from "@/modules/discovery/pre-import-filter";
import type { CandidateProfile } from "@/modules/matching/engine";
import { loadSearchPreferences } from "@/modules/matching/load-search-preferences";
import type { SearchPreferences } from "@/modules/matching/search-preferences";
import type { CuratedBoard } from "@/modules/discovery/curated-boards";
import { measureOperation } from "@/lib/performance/measure-operation";
import {
  CRON_BOARD_DELAY_MS,
  CRON_MAX_NEW_JOBS_PER_RUN,
  sleep,
  type CronDiscoverResult,
} from "@/lib/cron-discover";

export type BoardPollStats = {
  newJobs: number;
  skipped: number;
  updated: number;
  queuedForMatch: number;
  filtered: number;
};

const WORKDAY_DETAIL_CONCURRENCY = 3;

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function importNormalizedJob(
  db: Db,
  userId: string,
  job: NormalizedJob,
  provider: JobSourceProvider,
  boardUrl: string,
  caps: { remainingNewJobs: number },
  stats: BoardPollStats
): Promise<void> {
  const result = await measureOperation(
    "ingestion.persistDiscoveredJob",
    () =>
      persistDiscoveredJob(db, userId, job, {
        provider,
        sourceUrl: job.jobUrl || boardUrl,
        sourceJobId: job.sourceJobId,
        boardUrl,
      }),
    { source: "ingestion" }
  );

  if (!result.isNew) {
    if (result.contentUnchanged) {
      stats.skipped++;
    } else {
      stats.updated++;
      stats.queuedForMatch++;
    }
    return;
  }

  stats.newJobs++;
  stats.queuedForMatch++;
  caps.remainingNewJobs--;
}

async function importWorkdayJobs(
  db: Db,
  userId: string,
  jobs: NormalizedJob[],
  boardUrl: string,
  caps: { remainingNewJobs: number },
  stats: BoardPollStats,
  profile?: CandidateProfile,
  preferences?: SearchPreferences
): Promise<void> {
  const titled: NormalizedJob[] = [];
  for (const job of jobs) {
    if (!matchesDiscoveredJobTitle(job.title, profile)) {
      stats.filtered++;
      continue;
    }
    titled.push(job);
  }

  const concrete: NormalizedJob[] = [];
  const ambiguous: NormalizedJob[] = [];
  for (const job of titled) {
    if (workdayLocationNeedsDetail(job.location)) ambiguous.push(job);
    else concrete.push(job);
  }

  await drain(concrete, true);
  await drain(ambiguous, false);

  async function drain(queue: NormalizedJob[], locationKnown: boolean): Promise<void> {
    let index = 0;
    while (index < queue.length && caps.remainingNewJobs > 0) {
      const slice = queue.slice(index, index + WORKDAY_DETAIL_CONCURRENCY);
      index += slice.length;
      const pending: NormalizedJob[] = [];

      for (const job of slice) {
        if (caps.remainingNewJobs <= 0) break;
        if (locationKnown) {
          const prelim = shouldImportDiscoveredJob(
            job,
            profile,
            preferences,
            preferences?.gtaCities
          );
          if (!prelim.import) {
            stats.filtered++;
            continue;
          }
        }

        // Skip the detail request when this posting is already stored. The lookup stays
        // sequential so a daily poll does not repeat one HTTP request per known job.
        const existing = await findExistingJob(db, userId, {
          sourceJobId: job.sourceJobId,
          jobUrl: job.jobUrl,
        });
        if (existing) {
          stats.skipped++;
          continue;
        }
        pending.push(job);
      }

      const detailed = await mapLimit(pending, WORKDAY_DETAIL_CONCURRENCY, async (job) => {
        try {
          return await fetchWorkdayJobDetail(job);
        } catch (error) {
          console.error("[discovery] workday detail failed", job.jobUrl, error);
          return null;
        }
      });

      for (const job of detailed) {
        if (caps.remainingNewJobs <= 0) break;
        if (!job) {
          stats.filtered++;
          continue;
        }
        const filterResult = shouldImportDiscoveredJob(
          job,
          profile,
          preferences,
          preferences?.gtaCities
        );
        if (!filterResult.import) {
          stats.filtered++;
          continue;
        }
        await importNormalizedJob(db, userId, job, "workday", boardUrl, caps, stats);
      }
    }
  }
}

async function loadProfileForFilter(db: Db, userId: string): Promise<CandidateProfile | undefined> {
  const profile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    with: { skills: true, evidence: true },
  });
  if (!profile) return undefined;
  return {
    location: profile.location,
    workAuthorization: profile.workAuthorization,
    targetTitles: (profile.targetTitles as string[]) ?? [],
    preferredSeniority: profile.preferredSeniority,
    remotePreference: profile.remotePreference,
    preferredLocations: (profile.preferredLocations as string[]) ?? [],
    yearsExperience: profile.yearsExperience,
    skills: profile.skills.map((s) => ({
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
      yearsExperience: s.yearsExperience,
    })),
    evidence: profile.evidence.map((e) => ({
      id: e.id,
      evidenceText: e.evidenceText,
      normalizedSkills: (e.normalizedSkills as string[]) ?? [],
    })),
  };
}

export async function pollSavedBoard(
  db: Db,
  userId: string,
  board: {
    id: string;
    boardUrl: string;
    provider: JobSourceProvider;
    companyName: string;
  },
  caps: { remainingNewJobs: number },
  profile?: CandidateProfile,
  preferences?: SearchPreferences,
  options?: { trackSavedBoard?: boolean }
): Promise<BoardPollStats> {
  return measureOperation(
    "discovery.pollSavedBoard",
    async () => {
      const stats: BoardPollStats = {
        newJobs: 0,
        skipped: 0,
        updated: 0,
        queuedForMatch: 0,
        filtered: 0,
      };

      const parsed = normalizeBoardUrl(board.boardUrl, board.provider);
      const adapter =
        getAdapterForProvider(board.provider) ?? (await detectBestAdapter(parsed.boardUrl));

      const raw = await measureOperation(
        "ats.adapter.fetch",
        () => adapter.fetch(parsed.boardUrl),
        { source: "ats", recordCount: 1 }
      );
      const normalizedJobs = normalizeBoardJobs(raw).map((job) =>
        board.provider === "workday"
          ? { ...job, company: board.companyName || job.company }
          : job
      );

      if (board.provider === "workday") {
        await importWorkdayJobs(
          db,
          userId,
          normalizedJobs,
          parsed.boardUrl,
          caps,
          stats,
          profile,
          preferences
        );
      } else {
        for (const job of normalizedJobs) {
          if (caps.remainingNewJobs <= 0) break;

          const filterResult = shouldImportDiscoveredJob(
            job,
            profile,
            preferences,
            preferences?.gtaCities
          );
          if (!filterResult.import) {
            stats.filtered++;
            continue;
          }

          await importNormalizedJob(db, userId, job, board.provider, parsed.boardUrl, caps, stats);
        }
      }

      if (options?.trackSavedBoard !== false) {
        await db
          .update(savedBoards)
          .set({
            lastPolledAt: new Date(),
            boardUrl: parsed.boardUrl,
            lastPollNewJobs: stats.newJobs,
            lastPollSkipped: stats.skipped,
            lastPollFiltered: stats.filtered,
          })
          .where(eq(savedBoards.id, board.id));
      }

      return stats;
    },
    { source: "discovery" }
  );
}

export async function pollBoardsForUser(
  db: Db,
  userId: string,
  boards: Array<{
    id: string;
    boardUrl: string;
    provider: JobSourceProvider;
    companyName: string;
  }>,
  globalCaps: { remainingNewJobs: number },
  options?: { trackSavedBoard?: boolean }
): Promise<{
  results: Array<{ boardId: string; status: "success" | "error" }>;
  stats: BoardPollStats;
}> {
  const stats: BoardPollStats = {
    newJobs: 0,
    skipped: 0,
    updated: 0,
    queuedForMatch: 0,
    filtered: 0,
  };
  const results: Array<{ boardId: string; status: "success" | "error" }> = [];
  const profile = await loadProfileForFilter(db, userId);
  const preferences = await loadSearchPreferences(db, userId);

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    try {
      const boardStats = await pollSavedBoard(
        db,
        userId,
        board,
        globalCaps,
        profile,
        preferences,
        options
      );
      stats.newJobs += boardStats.newJobs;
      stats.skipped += boardStats.skipped;
      stats.updated += boardStats.updated;
      stats.queuedForMatch += boardStats.queuedForMatch;
      stats.filtered += boardStats.filtered;
      results.push({ boardId: board.id, status: "success" });
    } catch (error) {
      console.error(
        `[discovery] board poll failed userId=${userId} boardId=${board.id}`,
        error
      );
      if (options?.trackSavedBoard !== false) {
        try {
          await db
            .update(savedBoards)
            .set({ lastPolledAt: new Date() })
            .where(eq(savedBoards.id, board.id));
        } catch (stampError) {
          console.error(
            `[discovery] failed to record poll time boardId=${board.id}`,
            stampError
          );
        }
      }
      results.push({ boardId: board.id, status: "error" });
    }

    if (i < boards.length - 1) {
      await sleep(CRON_BOARD_DELAY_MS);
    }
  }

  return { results, stats };
}

export async function pollCuratedBoardsForUser(
  db: Db,
  userId: string,
  boards: CuratedBoard[],
  globalCaps: { remainingNewJobs: number }
): Promise<{
  results: Array<{ boardId: string; status: "success" | "error" }>;
  stats: BoardPollStats;
}> {
  const asSaved = boards.map((board) => ({
    id: `curated:${board.boardUrl}`,
    boardUrl: board.boardUrl,
    provider: board.provider,
    companyName: board.companyName,
  }));
  return pollBoardsForUser(db, userId, asSaved, globalCaps, { trackSavedBoard: false });
}

export function aggregateDiscoverStats(
  boardResults: Array<{ status: "success" | "error" }>,
  stats: {
    newJobs: number;
    skipped: number;
    matched?: number;
    filtered: number;
  }
): CronDiscoverResult {
  const succeeded = boardResults.filter((r) => r.status === "success").length;
  return {
    polled: boardResults.length,
    succeeded,
    failed: boardResults.length - succeeded,
    newJobs: stats.newJobs,
    skipped: stats.skipped,
    matched: stats.matched ?? 0,
    filtered: stats.filtered,
  };
}

export { CRON_MAX_NEW_JOBS_PER_RUN };
