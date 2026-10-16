import { and, desc, eq, gte, ilike, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/server/actions/helpers";
import { getProfileUpdatedAt } from "@/server/actions/helpers";
import { candidateProfiles, jobs, matchAnalyses } from "@/db/schema";
import {
  classifyLocationEligibility,
  isLocationClass,
  isLocationVisible,
  LOCATION_FEED_RANK,
  type LocationClass,
} from "@/modules/location/eligibility";
import { scoreFrontendFit } from "@/modules/matching/frontend-fit";
import { nonEngineeringReason } from "@/modules/matching/fit-score";
import { loadSearchPreferences } from "@/modules/matching/load-search-preferences";
import type { SearchPreferences } from "@/modules/matching/search-preferences";
import {
  DEFAULT_JOBS_FEED_LIMIT,
  MAX_JOBS_FEED_LIMIT,
  mapRowToJobListItem,
  type JobListItem,
  type JobsFeedCursor,
  type JobsFeedResult,
} from "./job-list-item";
import { estimatePayloadBytes } from "@/lib/performance/measure-operation";
import { measureOperation } from "@/lib/performance/measure-operation";
import { DISCOVERY_SOURCE_IDS } from "@/modules/discovery/source-catalog";

const DISCOVERY_PROVIDERS = new Set<string>(DISCOVERY_SOURCE_IDS);

export type JobsFeedFilters = {
  minScore?: number;
  remoteOnly?: boolean;
  canadaOnly?: boolean;
  classification?: string;
  source?: "discovered" | "manual";
  sort?: "match" | "recent" | "salary";
  search?: string;
  discoveredSince?: "24h" | "7d";
  includeDismissed?: boolean;
  strongUnseenOnly?: boolean;
  showLowFit?: boolean;
  showIneligible?: boolean;
  limit?: number;
  cursor?: JobsFeedCursor;
  /** When set, hide locations the user has not opted into and rank Remote-Canada first. */
  locationView?: SearchPreferences;
};

function applyInMemoryFilters(
  items: JobListItem[],
  filters?: JobsFeedFilters
): JobListItem[] {
  let filtered = items;

  if (filters?.strongUnseenOnly) {
    filtered = filtered.filter(
      (j) =>
        !j.isSaved &&
        j.status !== "dismissed" &&
        (j.match?.classification === "excellent" ||
          j.match?.classification === "strong")
    );
  }

  if (filters?.locationView) {
    const view = filters.locationView;
    filtered = filtered.filter((job) => {
      if (isRoleIneligible(job) && !filters.showIneligible) return false;
      return isLocationVisible(resolveLocationClass(job, view), view);
    });
  } else if (!filters?.showIneligible) {
    filtered = filtered.filter((job) => !isRoleIneligible(job));
  }

  const minFit = filters?.locationView?.minFitToShow ?? 50;
  if (!filters?.showLowFit) {
    filtered = filtered.filter((job) => feedScore(job) >= Math.max(minFit, filters?.minScore ?? 0));
  }

  if (filters?.minScore) {
    filtered = filtered.filter((j) => feedScore(j) >= filters.minScore!);
  }

  if (filters?.classification) {
    filtered = filtered.filter(
      (j) => j.match?.classification === filters.classification
    );
  }

  if (filters?.canadaOnly) {
    filtered = filtered.filter((j) => {
      const loc = (j.location ?? "").toLowerCase();
      return (
        loc.includes("canada") ||
        loc.includes("toronto") ||
        loc.includes("vancouver") ||
        loc.includes("montreal") ||
        loc.includes("remote - canada")
      );
    });
  }

  if (filters?.source === "discovered") {
    filtered = filtered.filter(
      (j) => j.sourceProvider && DISCOVERY_PROVIDERS.has(j.sourceProvider)
    );
  } else if (filters?.source === "manual") {
    filtered = filtered.filter(
      (j) => !j.sourceProvider || !DISCOVERY_PROVIDERS.has(j.sourceProvider)
    );
  }

  if (filters?.sort === "match" || !filters?.sort) {
    filtered = [...filtered].sort((a, b) => {
      const rankA = LOCATION_FEED_RANK[resolveLocationClass(a, filters?.locationView)];
      const rankB = LOCATION_FEED_RANK[resolveLocationClass(b, filters?.locationView)];
      if (rankA !== rankB) return rankA - rankB;
      return feedScore(b) - feedScore(a);
    });
  } else if (filters?.sort === "salary") {
    filtered = [...filtered].sort(
      (a, b) => (b.salaryMax ?? 0) - (a.salaryMax ?? 0)
    );
  }

  return filtered;
}

export async function fetchJobsFeed(
  db: Db,
  userId: string,
  filters?: JobsFeedFilters
): Promise<JobsFeedResult> {
  return measureOperation(
    "jobs.fetchFeed",
    async () => {
      const limit = Math.min(
        filters?.limit ?? DEFAULT_JOBS_FEED_LIMIT,
        MAX_JOBS_FEED_LIMIT
      );
      const fetchLimit =
        filters?.sort === "match" ||
        filters?.sort === "salary" ||
        filters?.minScore ||
        filters?.classification ||
        filters?.strongUnseenOnly ||
        filters?.canadaOnly ||
        filters?.source ||
        filters?.locationView
          ? Math.min(limit * 4, MAX_JOBS_FEED_LIMIT * 2)
          : limit + 1;

      const conditions = [eq(jobs.userId, userId)];

      if (!filters?.includeDismissed) {
        conditions.push(ne(jobs.status, "dismissed"));
      }

      if (filters?.remoteOnly) {
        conditions.push(eq(jobs.workplaceType, "remote"));
      }

      if (filters?.discoveredSince) {
        const ms =
          filters.discoveredSince === "24h"
            ? 24 * 60 * 60 * 1000
            : 7 * 24 * 60 * 60 * 1000;
        conditions.push(gte(jobs.dateDiscovered, new Date(Date.now() - ms)));
      }

      if (filters?.search) {
        const pattern = `%${filters.search.trim()}%`;
        conditions.push(
          or(ilike(jobs.title, pattern), ilike(jobs.location, pattern))!
        );
      }

      if (filters?.cursor && filters.sort !== "match" && filters.sort !== "salary") {
        const cursorDate = new Date(filters.cursor.dateDiscovered);
        conditions.push(
          or(
            lt(jobs.dateDiscovered, cursorDate),
            and(eq(jobs.dateDiscovered, cursorDate), lt(jobs.id, filters.cursor.id))
          )!
        );
      }

      const rows = await db.query.jobs.findMany({
        where: and(...conditions),
        orderBy: [desc(jobs.dateDiscovered), desc(jobs.id)],
        limit: fetchLimit,
        columns: {
          id: true,
          title: true,
          jobUrl: true,
          location: true,
          workplaceType: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          technologies: true,
          locationEligibility: true,
          locationFlags: true,
          description: true,
          fitScore: true,
          fitEligible: true,
          fitIneligibleReason: true,
          frontendFitScore: true,
          frontendFitReasons: true,
          isSaved: true,
          status: true,
          dateDiscovered: true,
        },
        with: {
          company: {
            columns: { name: true },
          },
          source: {
            columns: { provider: true },
          },
          requirements: {
            columns: {
              id: true,
              requirementType: true,
              normalizedSkill: true,
              text: true,
            },
          },
          matchAnalyses: {
            orderBy: [desc(matchAnalyses.createdAt)],
            limit: 1,
            columns: {
              overallScore: true,
              classification: true,
              topConcern: true,
              topMatchingSkills: true,
              createdAt: true,
            },
          },
        },
      });

      const preferences =
        filters?.locationView ?? (await loadSearchPreferences(db, userId));
      const profile = await loadFitProfile(db, userId);
      let mapped: JobListItem[] = rows.map((row) => {
        const item = mapRowToJobListItem(row);
        const location = classifyLocationEligibility(
          {
            title: item.title,
            location: item.location,
            workplaceType: item.workplaceType,
            description: row.description,
          },
          { gtaCities: preferences.gtaCities }
        );
        const storedScore = item.frontendFit?.score;
        const fit =
          storedScore == null
            ? scoreFrontendFit(
                {
                  title: item.title,
                  description: row.description,
                  location: item.location,
                  workplaceType: item.workplaceType,
                  technologies: item.technologies,
                  requirements: item.requirements,
                  salaryMin: item.salaryMin,
                  salaryMax: item.salaryMax,
                  salaryCurrency: item.salaryCurrency,
                },
                {
                  skills: profile.skills,
                  targetTitles: preferences.targetTitles,
                  yearsExperience: profile.yearsExperience,
                  minimumSalaryCad: preferences.minimumSalaryCad ?? profile.minimumSalary,
                },
                preferences.gtaCities
              )
            : null;
        return {
          ...item,
          locationClass: location.class,
          locationFlags: location.flags,
          frontendFit: fit
            ? { score: fit.score, reasons: fit.reasons }
            : item.frontendFit,
          fitEligible: fit ? fit.eligible : item.fitEligible,
          fitIneligibleReason: fit ? fit.ineligibleReason : item.fitIneligibleReason,
        };
      });
      const minFitToShow = preferences.minFitToShow;
      const lowFitCount = mapped.filter(
        (job) =>
          !isRoleIneligible(job) &&
          isLocationVisible(resolveLocationClass(job, preferences), preferences) &&
          feedScore(job) < minFitToShow
      ).length;
      const ineligibleCount = mapped.filter((job) => isRoleIneligible(job)).length;
      mapped = applyInMemoryFilters(mapped, filters);

      const hasMore = mapped.length > limit;
      const page = hasMore ? mapped.slice(0, limit) : mapped;
      const last = page.at(-1);
      const nextCursor: JobsFeedCursor | null =
        hasMore && last
          ? {
              id: last.id,
              dateDiscovered: last.dateDiscovered.toISOString(),
              sortScore: last.frontendFit?.score ?? last.match?.overallScore,
            }
          : null;

      const profileUpdatedAt = await getProfileUpdatedAt(db, userId);

      const result: JobsFeedResult = {
        jobs: page,
        profileUpdatedAt,
        totalCount: page.length,
        hasMore,
        nextCursor,
        lowFitCount,
        ineligibleCount,
        minFitToShow,
      };
      result.payloadBytes = estimatePayloadBytes(result);
      return result;
    },
    {
      source: "database",
      recordCountFromResult: (r) => r.jobs.length,
      payloadBytes: undefined,
    }
  );
}

function feedScore(job: JobListItem): number {
  return job.frontendFit?.score ?? 0;
}

function isRoleIneligible(job: JobListItem): boolean {
  if (job.fitIneligibleReason?.startsWith("Not an engineering role")) return true;
  return nonEngineeringReason(job.title) != null;
}

function resolveLocationClass(job: JobListItem, prefs?: SearchPreferences): LocationClass {
  if (isLocationClass(job.locationClass)) return job.locationClass;
  return classifyLocationEligibility(
    { location: job.location, workplaceType: job.workplaceType },
    { gtaCities: prefs?.gtaCities }
  ).class;
}

async function loadFitProfile(db: Db, userId: string): Promise<{
  skills: string[];
  preferredSeniority: string | null;
  minimumSalary: number | null;
  yearsExperience: number | null;
}> {
  const row = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    columns: { preferredSeniority: true, minimumSalary: true, yearsExperience: true },
    with: { skills: { columns: { name: true } } },
  });
  const skills = row?.skills?.map((skill) => skill.name) ?? [];
  return {
    skills,
    preferredSeniority: row?.preferredSeniority ?? null,
    minimumSalary: row?.minimumSalary ?? null,
    yearsExperience: row?.yearsExperience ?? null,
  };
}

export async function countAllUserJobs(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), ne(jobs.status, "dismissed")));
  return rows[0]?.count ?? 0;
}
