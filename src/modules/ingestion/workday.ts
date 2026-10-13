import {
  normalizedJobSchema,
  type NormalizedJob,
  type RawJobSource,
  type JobSourceAdapter,
} from "./types";
import { extractRequirementsFromText } from "./extract-requirements";
import { htmlToPlainText, sanitizeJobTitle } from "./html-text";
import { parseWorkdayUrl, type ParsedWorkdayUrl } from "./board-url";

const PAGE_SIZE = 20;
const MAX_PAGES = 20;

const WORKDAY_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "JobSearchAssistant/1.0",
};

export type WorkdayListJob = {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
};

export type WorkdayJobPostingInfo = {
  title?: string;
  jobDescription?: string;
  location?: string;
  timeType?: string;
  jobReqId?: string;
  postedOn?: string;
  startDate?: string;
  externalPath?: string;
};

type WorkdayListResponse = {
  total?: number;
  jobPostings?: WorkdayListJob[];
};

type WorkdayDetailResponse = {
  jobPostingInfo?: WorkdayJobPostingInfo;
};

function formatBoardName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncateLocation(loc?: string): string | undefined {
  if (!loc) return undefined;
  return loc.length > 200 ? loc.slice(0, 200) : loc;
}

function sourceId(preferred?: string, fallback?: string): string | undefined {
  const value = preferred?.trim() || fallback?.trim();
  if (!value) return undefined;
  return value.length > 200 ? value.slice(0, 200) : value;
}

function mapWorkplace(location?: string): "remote" | "hybrid" | "unknown" {
  if (/\bremote\b/i.test(location ?? "")) return "remote";
  if (/\bhybrid\b/i.test(location ?? "")) return "hybrid";
  return "unknown";
}

export function workdayJobUrl(boardUrl: string, externalPath: string): string {
  const base = boardUrl.replace(/\/+$/, "");
  const path = externalPath.startsWith("/") ? externalPath : `/${externalPath}`;
  return `${base}${path}`;
}

function cxsBase(parsed: ParsedWorkdayUrl): string {
  return `https://${parsed.tenant}.${parsed.cluster}.myworkdayjobs.com/wday/cxs/${parsed.tenant}/${parsed.site}`;
}

async function fetchWorkdayJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { ...WORKDAY_HEADERS, ...init.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Workday fetch failed: HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchWorkdayBoardList(parsed: ParsedWorkdayUrl): Promise<WorkdayListJob[]> {
  const jobs: WorkdayListJob[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  for (let page = 0; page < MAX_PAGES && offset < total; page++) {
    const data = (await fetchWorkdayJson(`${cxsBase(parsed)}/jobs`, {
      method: "POST",
      body: JSON.stringify({
        appliedFacets: {},
        limit: PAGE_SIZE,
        offset,
        searchText: "",
      }),
    })) as WorkdayListResponse;

    const postings = data.jobPostings ?? [];
    if (typeof data.total === "number") total = data.total;
    jobs.push(...postings);
    offset += PAGE_SIZE;
    if (postings.length === 0 || postings.length < PAGE_SIZE) break;
  }

  return jobs.filter((job) => job.title && job.externalPath);
}

async function fetchWorkdayDetail(parsed: ParsedWorkdayUrl): Promise<WorkdayJobPostingInfo> {
  if (!parsed.externalPath) {
    throw new Error("Could not parse Workday job URL.");
  }
  const data = (await fetchWorkdayJson(`${cxsBase(parsed)}${parsed.externalPath}`, {
    method: "GET",
  })) as WorkdayDetailResponse;
  if (!data.jobPostingInfo) {
    throw new Error("Workday job detail missing posting info.");
  }
  return data.jobPostingInfo;
}

export function normalizeWorkdayListJob(
  job: WorkdayListJob,
  companyName: string,
  boardUrl: string
): NormalizedJob {
  const location = truncateLocation(job.locationsText);
  const description = [job.title, location].filter(Boolean).join("\n");

  return normalizedJobSchema.parse({
    company: companyName,
    title: sanitizeJobTitle(job.title),
    location,
    workplaceType: mapWorkplace(location),
    description: description || job.title || "Untitled Role",
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    technologies: [],
    jobUrl: workdayJobUrl(boardUrl, job.externalPath),
    sourceJobId: sourceId(job.bulletFields?.[0], job.externalPath),
    datePosted: job.postedOn,
  });
}

export function normalizeWorkdayDetail(
  job: WorkdayJobPostingInfo,
  companyName: string,
  jobUrl: string
): NormalizedJob {
  const description = htmlToPlainText(job.jobDescription ?? "");
  const reqs = extractRequirementsFromText(description);
  const location = truncateLocation(job.location);

  return normalizedJobSchema.parse({
    company: companyName,
    title: sanitizeJobTitle(job.title),
    location,
    workplaceType: mapWorkplace(location),
    description: description || job.title || "Untitled Role",
    responsibilities: reqs.responsibilities,
    requiredQualifications: reqs.required,
    preferredQualifications: reqs.preferred,
    technologies: reqs.technologies,
    jobUrl,
    sourceJobId: sourceId(job.jobReqId, job.externalPath),
    employmentType: job.timeType,
    datePosted: job.startDate ?? job.postedOn,
  });
}

export async function fetchWorkdayJobDetail(job: NormalizedJob): Promise<NormalizedJob> {
  if (!job.jobUrl) {
    throw new Error("Workday job is missing a URL.");
  }
  const parsed = parseWorkdayUrl(job.jobUrl);
  if (!parsed?.externalPath) {
    throw new Error("Could not parse Workday job URL.");
  }
  const detail = await fetchWorkdayDetail(parsed);
  const normalized = normalizeWorkdayDetail(detail, job.company, job.jobUrl);
  return {
    ...normalized,
    sourceJobId: job.sourceJobId ?? normalized.sourceJobId,
    location: normalized.location ?? job.location,
  };
}

export const workdayAdapter: JobSourceAdapter = {
  provider: "workday",

  async detect(input: string) {
    const isWorkday = /myworkdayjobs\.com/i.test(input);
    return {
      confidence: isWorkday ? 0.95 : 0,
      reason: isWorkday ? "Workday URL detected" : "Not Workday",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const url = input.trim();
    const parsed = parseWorkdayUrl(url);
    if (!parsed) {
      throw new Error("Could not parse Workday board from URL.");
    }

    const companyName = formatBoardName(parsed.tenant);

    if (parsed.isSingleJob) {
      const job = await fetchWorkdayDetail(parsed);
      const description = htmlToPlainText(job.jobDescription ?? "");
      return {
        provider: "workday",
        sourceUrl: parsed.boardUrl,
        sourceJobId: sourceId(job.jobReqId, parsed.externalPath),
        rawText: description,
        rawPayload: { job, companyName, jobUrl: parsed.boardUrl },
      };
    }

    const jobs = await fetchWorkdayBoardList(parsed);
    const combined = jobs.map((job) => job.title).filter(Boolean).join("\n");

    return {
      provider: "workday",
      sourceUrl: parsed.boardUrl,
      rawText: combined,
      rawPayload: {
        jobs,
        companyName,
        board: parsed.boardSlug,
        boardUrl: parsed.boardUrl,
      },
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const payload = raw.rawPayload as
      | { job: WorkdayJobPostingInfo; companyName?: string; jobUrl?: string }
      | { jobs: WorkdayListJob[]; companyName?: string; boardUrl?: string }
      | undefined;

    if (payload && "job" in payload) {
      return normalizeWorkdayDetail(
        payload.job,
        payload.companyName ?? "Company",
        payload.jobUrl || raw.sourceUrl || ""
      );
    }

    if (payload && "jobs" in payload && payload.jobs.length === 1) {
      return normalizeWorkdayListJob(
        payload.jobs[0],
        payload.companyName ?? "Company",
        payload.boardUrl || raw.sourceUrl || ""
      );
    }

    const text = htmlToPlainText(raw.rawText);
    const reqs = extractRequirementsFromText(text);
    const companyName =
      payload && "companyName" in payload ? payload.companyName : undefined;

    return normalizedJobSchema.parse({
      company: companyName ?? "Workday Board",
      title: "Multiple Positions",
      description: text || "Multiple Positions",
      responsibilities: reqs.responsibilities,
      requiredQualifications: reqs.required,
      preferredQualifications: reqs.preferred,
      technologies: reqs.technologies,
      jobUrl: raw.sourceUrl,
    });
  },
};
