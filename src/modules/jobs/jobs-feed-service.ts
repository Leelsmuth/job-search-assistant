import { and, desc, eq, gte, ilike, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/server/actions/helpers";
import { getProfileUpdatedAt } from "@/server/actions/helpers";
import { jobs, matchAnalyses } from "@/db/schema";
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

const DISCOVERY_PROVIDERS = new Set(["greenhouse", "lever", "ashby"]);

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
  limit?: number;
  cursor?: JobsFeedCursor;
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

  if (filters?.minScore) {
    filtered = filtered.filter(
      (j) => (j.match?.overallScore ?? 0) >= filters.minScore!
    );
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

  if (filters?.sort === "match") {
    filtered = [...filtered].sort(
      (a, b) => (b.match?.overallScore ?? 0) - (a.match?.overallScore ?? 0)
    );
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
        filters?.source
          ? Math.min(limit * 3, MAX_JOBS_FEED_LIMIT * 2)
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

      let mapped = rows.map(mapRowToJobListItem);
      mapped = applyInMemoryFilters(mapped, filters);

      const hasMore = mapped.length > limit;
      const page = hasMore ? mapped.slice(0, limit) : mapped;
      const last = page.at(-1);
      const nextCursor: JobsFeedCursor | null =
        hasMore && last
          ? {
              id: last.id,
              dateDiscovered: last.dateDiscovered.toISOString(),
              sortScore: last.match?.overallScore,
            }
          : null;

      const profileUpdatedAt = await getProfileUpdatedAt(db, userId);

      const result: JobsFeedResult = {
        jobs: page,
        profileUpdatedAt,
        totalCount: page.length,
        hasMore,
        nextCursor,
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

export async function countAllUserJobs(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), ne(jobs.status, "dismissed")));
  return rows[0]?.count ?? 0;
}
