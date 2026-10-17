import {
  normalizedJobSchema,
  type NormalizedJob,
  type RawJobSource,
  type JobSourceAdapter,
} from "./types";
import { extractRequirementsFromText } from "./extract-requirements";
import { htmlToPlainText, sanitizeJobTitle } from "./html-text";
import { parseWorkdayUrl, type ParsedWorkdayUrl } from "./board-url";
import { assertWorkdayJobsUrl, UnsafeUrlError } from "./ssrf";

const PAGE_SIZE = 20;
/**
 * Unique jobs kept from keyword searches. Lower than the old unfiltered cap so a
 * fuzzy term such as "react" cannot crowd out the rest of the searches.
 */
export const WORKDAY_MAX_JOBS_PER_BOARD = 300;
/** Boards this size or smaller are listed without a keyword so nothing is missed. */
const FULL_LIST_MAX = 500;
/**
 * Each searchText query reads at most this many pages. A query whose reported
 * total is larger than this many pages stops after the first page: Workday
 * ranks that page by relevance, and another page on a slow tenant does not fit
 * the cron time limit.
 */
export const WORKDAY_MAX_PAGES_PER_SEARCH = 2;
const MAX_LIST_REQUESTS = 25;
const PAGE_DELAY_MS = process.env.VITEST ? 0 : 150;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
/**
 * Workday sometimes answers a CXS POST with 303 (and a Location on a host that
 * is not a career site). Following that hop drops the POST body and would
 * request the other host. Retry the original allowlisted URL instead.
 */
const MAX_POST_REDIRECT_RETRIES = 2;

/**
 * CXS searchText queries for frontend-leaning roles.
 * The frontend-fit title phrases are front end, UI engineer/developer,
 * design engineer, React, and TypeScript. javascript, web developer, and
 * full stack are the extra discovery terms. "front-end" and "web platform"
 * are left out: Workday treats them like the phrases already listed, and each
 * extra query on a slow tenant costs several seconds.
 */
export const WORKDAY_FRONTEND_SEARCHES = [
  "frontend",
  "front end",
  "react",
  "UI developer",
  "UI engineer",
  "web developer",
  "javascript",
  "typescript",
  "full stack",
  "design engineer",
] as const;

const WORKDAY_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "JobSearchAssistant/1.0",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type WorkdayListJob = {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  remoteType?: string;
  bulletFields?: string[];
};

export type WorkdayJobPostingInfo = {
  title?: string;
  jobDescription?: string;
  location?: string;
  additionalLocations?: string[] | null;
  remoteType?: string;
  timeType?: string;
  jobReqId?: string;
  postedOn?: string;
  startDate?: string;
  externalPath?: string | null;
  externalUrl?: string;
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

function looksLikeReqId(value: string): boolean {
  return (
    /\d/.test(value) &&
    !/\s/.test(value) &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(value)
  );
}

export function workdayLocationNeedsDetail(location?: string): boolean {
  const value = location?.trim() ?? "";
  if (!value) return true;
  return /^(\d+\s+)?locations?$/i.test(value) || /^multiple locations$/i.test(value);
}

export function formatWorkdayLocations(input: {
  location?: string | null;
  additionalLocations?: Array<string | null> | null;
  locationsText?: string | null;
}): string | undefined {
  const parts: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed || workdayLocationNeedsDetail(trimmed)) return;
    if (parts.some((part) => part.toLowerCase() === trimmed.toLowerCase())) return;
    parts.push(trimmed);
  };

  push(input.location);
  for (const extra of input.additionalLocations ?? []) push(extra);
  if (parts.length === 0) push(input.locationsText);
  if (parts.length > 0) return truncateLocation(parts.join("; "));

  const fallback = input.locationsText?.trim();
  return fallback ? truncateLocation(fallback) : undefined;
}

function mapWorkplace(
  remoteType?: string | null,
  location?: string
): "remote" | "hybrid" | "on_site" | "unknown" {
  const remote = (remoteType ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (remote === "remote") return "remote";
  if (remote === "hybrid") return "hybrid";
  if (remote === "onsite" || remote === "on_site") return "on_site";
  if (/\bremote\b/i.test(location ?? "")) return "remote";
  if (/\bhybrid\b/i.test(location ?? "")) return "hybrid";
  return "unknown";
}

const POSTED_TODAY = /^posted today$/i;
const POSTED_YESTERDAY = /^posted yesterday$/i;
const POSTED_DAYS = /^posted\s+(\d+)\+?\s+days?\s+ago$/i;

/** Convert Workday's "Posted X Days Ago" text (or an ISO date) into an ISO timestamp. */
export function parseWorkdayPostedDate(value: string | undefined, now = new Date()): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }

  let days: number | undefined;
  if (POSTED_TODAY.test(trimmed)) days = 0;
  else if (POSTED_YESTERDAY.test(trimmed)) days = 1;
  else {
    const match = trimmed.match(POSTED_DAYS);
    if (match) days = Number(match[1]);
  }
  if (days === undefined || !Number.isInteger(days) || days < 0) return undefined;

  const posted = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  posted.setUTCDate(posted.getUTCDate() - days);
  return posted.toISOString();
}

function workdayPostedDate(postedOn?: string, startDate?: string, now = new Date()): string | undefined {
  if (startDate && /^\d{4}-\d{2}-\d{2}/.test(startDate.trim())) {
    const fromStart = parseWorkdayPostedDate(startDate, now);
    if (fromStart) return fromStart;
  }
  return parseWorkdayPostedDate(postedOn, now);
}

export function workdayJobUrl(boardUrl: string, externalPath: string): string {
  const base = boardUrl.replace(/\/+$/, "");
  const path = externalPath.startsWith("/") ? externalPath : `/${externalPath}`;
  return `${base}${path}`;
}

function safeJobPath(externalPath: string): string | null {
  const path = externalPath.startsWith("/") ? externalPath : `/${externalPath}`;
  if (!path.startsWith("/job/")) return null;
  if (path.includes("..") || path.includes("//") || path.includes("\\") || path.includes("@")) {
    return null;
  }
  return path;
}

function cxsBase(parsed: ParsedWorkdayUrl): string {
  return `https://${parsed.tenant}.${parsed.cluster}.myworkdayjobs.com/wday/cxs/${parsed.tenant}/${parsed.site}`;
}

function responseLocation(response: Response): string | null {
  const headers = response.headers;
  if (!headers || typeof headers.get !== "function") return null;
  return headers.get("location");
}

function redirectHostname(location: string, current: string): string {
  try {
    return new URL(location, current).hostname || "unknown";
  } catch {
    return "invalid";
  }
}

/** Follow only https career-site URLs. A bad Location is not requested. */
function allowlistedRedirect(location: string, current: string): URL | null {
  try {
    const next = new URL(location, current);
    assertWorkdayJobsUrl(next.href);
    return next;
  } catch (error) {
    if (error instanceof UnsafeUrlError) return null;
    return null;
  }
}

async function fetchWorkdayJson(url: string, init: RequestInit): Promise<unknown> {
  let current = assertWorkdayJobsUrl(url).toString();
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  let followed = 0;
  let postRetries = 0;

  while (followed <= MAX_REDIRECTS) {
    const response = await fetch(current, {
      method,
      body,
      headers: { ...WORKDAY_HEADERS, ...init.headers },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 429) {
      throw new Error("Workday rate limit: HTTP 429");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = responseLocation(response);
      const next = location ? allowlistedRedirect(location, current) : null;
      const preservesBody = response.status === 307 || response.status === 308;
      if (next && (method === "GET" || method === "HEAD" || preservesBody)) {
        if (followed === MAX_REDIRECTS) {
          throw new UnsafeUrlError("Too many redirects");
        }
        current = next.toString();
        if (!preservesBody) {
          method = "GET";
          body = undefined;
        }
        followed += 1;
        continue;
      }

      // List calls are POST. Do not follow a hop that leaves the allowlist or
      // turns the search into a GET. Ask the same career-site URL again.
      if (method === "POST" && postRetries < MAX_POST_REDIRECT_RETRIES) {
        postRetries += 1;
        await sleep(PAGE_DELAY_MS);
        continue;
      }

      if (!location) throw new UnsafeUrlError("Workday redirect is missing a location");
      if (!next) {
        throw new UnsafeUrlError(
          `URL host is not an allowlisted Workday jobs host (${redirectHostname(location, current)})`
        );
      }
      throw new UnsafeUrlError("Too many redirects");
    }

    if (!response.ok) {
      throw new Error(`Workday fetch failed: HTTP ${response.status}`);
    }
    return response.json();
  }

  throw new UnsafeUrlError("Too many redirects");
}

type ListBudget = { requests: number };

async function fetchJobPage(
  parsed: ParsedWorkdayUrl,
  offset: number,
  searchText: string,
  budget: ListBudget
): Promise<WorkdayListResponse> {
  if (budget.requests > 0) await sleep(PAGE_DELAY_MS);
  if (budget.requests >= MAX_LIST_REQUESTS) {
    return { total: 0, jobPostings: [] };
  }
  budget.requests += 1;
  return (await fetchWorkdayJson(`${cxsBase(parsed)}/jobs`, {
    method: "POST",
    body: JSON.stringify({
      appliedFacets: {},
      limit: PAGE_SIZE,
      offset,
      searchText,
    }),
  })) as WorkdayListResponse;
}

function usableJobs(postings: WorkdayListJob[] | undefined): WorkdayListJob[] {
  return (postings ?? []).filter((job) => job.title && safeJobPath(job.externalPath));
}

async function collectSearch(
  parsed: ParsedWorkdayUrl,
  searchText: string,
  budget: ListBudget,
  limit: number
): Promise<WorkdayListJob[]> {
  const jobs: WorkdayListJob[] = [];
  const perSearchLimit = Math.min(limit, PAGE_SIZE * WORKDAY_MAX_PAGES_PER_SEARCH);
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let pages = 0;

  while (
    jobs.length < perSearchLimit &&
    pages < WORKDAY_MAX_PAGES_PER_SEARCH &&
    offset < total
  ) {
    if (budget.requests >= MAX_LIST_REQUESTS) break;
    const data = await fetchJobPage(parsed, offset, searchText, budget);
    pages += 1;
    if (typeof data.total === "number") total = data.total;
    const postings = usableJobs(data.jobPostings);
    jobs.push(...postings);
    offset += PAGE_SIZE;
    if (postings.length === 0 || postings.length < PAGE_SIZE) break;
    if (total > PAGE_SIZE * WORKDAY_MAX_PAGES_PER_SEARCH) break;
  }

  return jobs.slice(0, perSearchLimit);
}

function addUnique(into: WorkdayListJob[], seen: Set<string>, jobs: WorkdayListJob[]): void {
  for (const job of jobs) {
    if (seen.has(job.externalPath)) continue;
    seen.add(job.externalPath);
    into.push(job);
    if (into.length >= WORKDAY_MAX_JOBS_PER_BOARD) return;
  }
}

async function fetchWorkdayBoardList(parsed: ParsedWorkdayUrl): Promise<WorkdayListJob[]> {
  const budget: ListBudget = { requests: 0 };
  const first = await fetchJobPage(parsed, 0, "", budget);
  const total = typeof first.total === "number" ? first.total : usableJobs(first.jobPostings).length;

  if (total <= FULL_LIST_MAX) {
    const jobs = usableJobs(first.jobPostings);
    let offset = PAGE_SIZE;
    while (jobs.length < Math.min(total, FULL_LIST_MAX) && offset < total) {
      if (budget.requests >= MAX_LIST_REQUESTS) break;
      const data = await fetchJobPage(parsed, offset, "", budget);
      const postings = usableJobs(data.jobPostings);
      jobs.push(...postings);
      offset += PAGE_SIZE;
      if (postings.length === 0 || postings.length < PAGE_SIZE) break;
    }
    return jobs.slice(0, FULL_LIST_MAX);
  }

  const jobs: WorkdayListJob[] = [];
  const seen = new Set<string>();
  for (const searchText of WORKDAY_FRONTEND_SEARCHES) {
    if (jobs.length >= WORKDAY_MAX_JOBS_PER_BOARD || budget.requests >= MAX_LIST_REQUESTS) break;
    const found = await collectSearch(
      parsed,
      searchText,
      budget,
      WORKDAY_MAX_JOBS_PER_BOARD - jobs.length
    );
    addUnique(jobs, seen, found);
  }

  if (jobs.length === 0) {
    return usableJobs(first.jobPostings).slice(0, WORKDAY_MAX_JOBS_PER_BOARD);
  }
  return jobs;
}

async function fetchWorkdayDetail(parsed: ParsedWorkdayUrl): Promise<WorkdayJobPostingInfo> {
  const path = parsed.externalPath ? safeJobPath(parsed.externalPath) : null;
  if (!path) {
    throw new Error("Could not parse Workday job URL.");
  }
  const data = (await fetchWorkdayJson(`${cxsBase(parsed)}${path}`, {
    method: "GET",
  })) as WorkdayDetailResponse;
  if (!data.jobPostingInfo) {
    throw new Error("Workday job detail missing posting info.");
  }
  return data.jobPostingInfo;
}

function listSourceId(job: WorkdayListJob): string | undefined {
  const bullets = (job.bulletFields ?? []).map((field) => field.trim()).filter(Boolean);
  const reqId = [...bullets].reverse().find(looksLikeReqId);
  return sourceId(reqId, job.externalPath);
}

function locationFromList(job: WorkdayListJob): string | undefined {
  if (job.locationsText?.trim()) {
    return formatWorkdayLocations({ locationsText: job.locationsText });
  }
  const places = (job.bulletFields ?? [])
    .map((field) => field.trim())
    .filter((field) => field && !looksLikeReqId(field));
  return formatWorkdayLocations({ locationsText: places.join(", ") });
}

function applyUrl(fallback: string, externalUrl?: string): string {
  if (!externalUrl) return fallback;
  try {
    return assertWorkdayJobsUrl(externalUrl).toString();
  } catch {
    return fallback;
  }
}

export function normalizeWorkdayListJob(
  job: WorkdayListJob,
  companyName: string,
  boardUrl: string
): NormalizedJob {
  const location = locationFromList(job);
  const description = [job.title, location].filter(Boolean).join("\n");

  return normalizedJobSchema.parse({
    company: companyName,
    title: sanitizeJobTitle(job.title),
    location,
    workplaceType: mapWorkplace(job.remoteType, location),
    description: description || job.title || "Untitled Role",
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    technologies: [],
    jobUrl: workdayJobUrl(boardUrl, safeJobPath(job.externalPath) ?? job.externalPath),
    sourceJobId: listSourceId(job),
    datePosted: parseWorkdayPostedDate(job.postedOn),
  });
}

export function normalizeWorkdayDetail(
  job: WorkdayJobPostingInfo,
  companyName: string,
  jobUrl: string
): NormalizedJob {
  const description = htmlToPlainText(job.jobDescription ?? "");
  const reqs = extractRequirementsFromText(description);
  const location = formatWorkdayLocations({
    location: job.location,
    additionalLocations: job.additionalLocations,
  });

  return normalizedJobSchema.parse({
    company: companyName,
    title: sanitizeJobTitle(job.title),
    location,
    workplaceType: mapWorkplace(job.remoteType, location),
    description: description || job.title || "Untitled Role",
    responsibilities: reqs.responsibilities,
    requiredQualifications: reqs.required,
    preferredQualifications: reqs.preferred,
    technologies: reqs.technologies,
    jobUrl: applyUrl(jobUrl, job.externalUrl),
    sourceJobId: sourceId(job.jobReqId, job.externalPath ?? undefined),
    employmentType: job.timeType,
    datePosted: workdayPostedDate(job.postedOn, job.startDate),
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
    datePosted: normalized.datePosted ?? job.datePosted,
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
    assertWorkdayJobsUrl(parsed.boardUrl);

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
