import { eq } from "drizzle-orm";
import { savedBoards, candidateProfiles } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { normalizeBoardUrl } from "@/modules/ingestion/board-url";
import {
  detectBestAdapter,
  getAdapterForProvider,
} from "@/modules/ingestion/adapters";
import type { JobSourceProvider } from "@/modules/ingestion/types";
import { normalizeBoardJobs } from "@/modules/ingestion/board-normalize";
import { persistDiscoveredJob } from "@/modules/ingestion/persist-job";
import { runAndSaveMatchAnalysisDb } from "@/modules/matching/save-match-analysis";
import { shouldImportDiscoveredJob } from "@/modules/discovery/pre-import-filter";
import type { CandidateProfile } from "@/modules/matching/engine";
import {
  CRON_BOARD_DELAY_MS,
  CRON_MAX_NEW_JOBS_PER_RUN,
  sleep,
  type CronDiscoverResult,
} from "@/lib/cron-discover";

export type BoardPollStats = {
  newJobs: number;
  skipped: number;
  matched: number;
  filtered: number;
};

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
  profile?: CandidateProfile
): Promise<BoardPollStats> {
  const stats: BoardPollStats = { newJobs: 0, skipped: 0, matched: 0, filtered: 0 };

  const parsed = normalizeBoardUrl(board.boardUrl, board.provider);
  const adapter =
    getAdapterForProvider(board.provider) ?? (await detectBestAdapter(parsed.boardUrl));
  const raw = await adapter.fetch(parsed.boardUrl);
  const normalizedJobs = normalizeBoardJobs(raw);

  for (const job of normalizedJobs) {
    if (caps.remainingNewJobs <= 0) break;

    const filterResult = shouldImportDiscoveredJob(job, profile);
    if (!filterResult.import) {
      stats.filtered++;
      continue;
    }

    const result = await persistDiscoveredJob(db, userId, job, {
      provider: board.provider,
      sourceUrl: job.jobUrl || parsed.boardUrl,
      sourceJobId: job.sourceJobId,
      boardUrl: parsed.boardUrl,
    });

    if (!result.isNew) {
      stats.skipped++;
      continue;
    }

    stats.newJobs++;
    caps.remainingNewJobs--;

    await runAndSaveMatchAnalysisDb(db, userId, result.jobId);
    stats.matched++;
  }

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

  return stats;
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
  globalCaps: { remainingNewJobs: number }
): Promise<{
  results: Array<{ boardId: string; status: "success" | "error" }>;
  stats: BoardPollStats;
}> {
  const stats: BoardPollStats = { newJobs: 0, skipped: 0, matched: 0, filtered: 0 };
  const results: Array<{ boardId: string; status: "success" | "error" }> = [];
  const profile = await loadProfileForFilter(db, userId);

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    try {
      const boardStats = await pollSavedBoard(db, userId, board, globalCaps, profile);
      stats.newJobs += boardStats.newJobs;
      stats.skipped += boardStats.skipped;
      stats.matched += boardStats.matched;
      stats.filtered += boardStats.filtered;
      results.push({ boardId: board.id, status: "success" });
    } catch (error) {
      console.error(
        `[discovery] board poll failed userId=${userId} boardId=${board.id}`,
        error
      );
      results.push({ boardId: board.id, status: "error" });
    }

    if (i < boards.length - 1) {
      await sleep(CRON_BOARD_DELAY_MS);
    }
  }

  return { results, stats };
}

export function aggregateDiscoverStats(
  boardResults: Array<{ status: "success" | "error" }>,
  stats: BoardPollStats
): CronDiscoverResult {
  const succeeded = boardResults.filter((r) => r.status === "success").length;
  return {
    polled: boardResults.length,
    succeeded,
    failed: boardResults.length - succeeded,
    newJobs: stats.newJobs,
    skipped: stats.skipped,
    matched: stats.matched,
    filtered: stats.filtered,
  };
}

export { CRON_MAX_NEW_JOBS_PER_RUN };
