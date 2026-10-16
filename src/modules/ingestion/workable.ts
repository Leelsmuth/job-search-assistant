import { fetchAllowlisted } from "./ats-http";
import { listingToNormalizedJob } from "./listing-job";
import type { JobSourceAdapter, NormalizedJob, RawJobSource } from "./types";

const HOST = /^(?:www\.)?workable\.com$/i;

export type WorkableWidgetJob = {
  title?: string;
  shortcode?: string;
  employment_type?: string;
  telecommuting?: boolean;
  department?: string;
  url?: string;
  application_url?: string;
  published_on?: string;
  country?: string;
  city?: string;
  state?: string;
  description?: string;
};

export function normalizeWorkableJob(job: WorkableWidgetJob, companyName: string): NormalizedJob {
  const place = [job.city, job.state, job.country].filter(Boolean).join(", ");
  const workplaceType = job.telecommuting ? "remote" : "unknown";
  return listingToNormalizedJob({
    company: companyName,
    title: job.title || "Role",
    location: place,
    workplaceType,
    description: job.description,
    jobUrl: job.application_url || job.url,
    sourceJobId: job.shortcode,
    datePosted: job.published_on,
    employmentType: job.employment_type,
    provider: "workable",
  });
}

export async function fetchWorkableBoard(account: string): Promise<{
  companyName: string;
  jobs: NormalizedJob[];
}> {
  const url = `https://www.workable.com/api/accounts/${encodeURIComponent(account)}?details=true`;
  const response = await fetchAllowlisted(url, HOST);
  const data = (await response.json()) as { name?: string; jobs?: WorkableWidgetJob[] };
  const companyName = data.name || account;
  return {
    companyName,
    jobs: (data.jobs ?? []).map((job) => normalizeWorkableJob(job, companyName)),
  };
}

export const workableAdapter: JobSourceAdapter = {
  provider: "workable",

  async detect(input: string) {
    const match = /workable\.com/i.test(input);
    return {
      confidence: match ? 0.96 : 0,
      reason: match ? "Workable URL detected" : "Not Workable",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const { normalizeBoardUrl } = await import("./board-url");
    const parsed = normalizeBoardUrl(input, "workable");
    const board = await fetchWorkableBoard(parsed.boardSlug);
    return {
      provider: "workable",
      sourceUrl: parsed.boardUrl,
      rawText: board.jobs.map((job) => job.title).join("\n"),
      rawPayload: board,
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const jobs = (raw.rawPayload as { jobs?: NormalizedJob[] } | undefined)?.jobs ?? [];
    if (jobs[0]) return jobs[0];
    return listingToNormalizedJob({
      company: "Workable",
      title: "Multiple Positions",
      description: raw.rawText,
      provider: "workable",
    });
  },
};
