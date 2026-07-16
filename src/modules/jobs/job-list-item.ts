export type JobListItem = {
  id: string;
  title: string;
  jobUrl: string | null;
  location: string | null;
  workplaceType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  isSaved: boolean;
  status: string | null;
  dateDiscovered: Date;
  company: { name: string } | null;
  sourceProvider: string | null;
  requirements: Array<{
    id: string;
    requirementType: string;
    normalizedSkill: string | null;
    text: string;
  }>;
  match: {
    overallScore: number;
    classification: string;
    topConcern: string | null;
    topMatchingSkills: string[];
    createdAt: Date;
  } | null;
};

export type JobsFeedCursor = {
  id: string;
  dateDiscovered: string;
  sortScore?: number;
};

export type JobsFeedResult = {
  jobs: JobListItem[];
  profileUpdatedAt: Date | null;
  totalCount: number;
  hasMore: boolean;
  nextCursor: JobsFeedCursor | null;
  payloadBytes?: number;
};

export const DEFAULT_JOBS_FEED_LIMIT = 50;
export const MAX_JOBS_FEED_LIMIT = 100;

export function mapRowToJobListItem(row: {
  id: string;
  title: string;
  jobUrl: string | null;
  location: string | null;
  workplaceType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  isSaved: boolean;
  status: string | null;
  dateDiscovered: Date;
  company: { name: string } | null;
  source: { provider: string } | null;
  requirements: Array<{
    id: string;
    requirementType: string;
    normalizedSkill: string | null;
    text: string;
  }>;
  matchAnalyses: Array<{
    overallScore: number;
    classification: string;
    topConcern: string | null;
    topMatchingSkills: string[] | null;
    createdAt: Date;
  }>;
}): JobListItem {
  const latest = row.matchAnalyses[0];
  return {
    id: row.id,
    title: row.title,
    jobUrl: row.jobUrl,
    location: row.location,
    workplaceType: row.workplaceType,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency,
    isSaved: row.isSaved,
    status: row.status,
    dateDiscovered: row.dateDiscovered,
    company: row.company,
    sourceProvider: row.source?.provider ?? null,
    requirements: row.requirements,
    match: latest
      ? {
          overallScore: latest.overallScore,
          classification: latest.classification,
          topConcern: latest.topConcern,
          topMatchingSkills: latest.topMatchingSkills ?? [],
          createdAt: latest.createdAt,
        }
      : null,
  };
}
