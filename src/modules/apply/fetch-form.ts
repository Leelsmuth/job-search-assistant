import { fetchWithTimeout } from "@/lib/performance/fetch-with-timeout";
import { parseBoardUrl } from "@/modules/ingestion/board-url";
import type { ApplyProvider, ApplyTarget, FetchedApplicationForm, FormQuestion } from "./types";
import {
  greenhouseApplyUrl,
  parseAshbyQuestions,
  parseGreenhouseQuestions,
  parseLeverQuestions,
  standardQuestions,
} from "./questions";

export const FORM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_HOSTS = new Set([
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.ashbyhq.com",
  "jobs.ashbyhq.com",
]);

const SLUG = /^[A-Za-z0-9_-]{1,80}$/;

export type FetchLike = (
  input: string,
  init?: RequestInit & { timeoutMs?: number }
) => Promise<Response>;

export function safeApplyUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isFormCacheFresh(fetchedAt: string, now = Date.now()): boolean {
  const time = new Date(fetchedAt).getTime();
  if (Number.isNaN(time)) return false;
  return now - time < FORM_CACHE_TTL_MS;
}

function asProvider(value: string | null): ApplyProvider {
  if (value === "greenhouse" || value === "lever" || value === "ashby" || value === "workday") {
    return value;
  }
  return "unknown";
}

function idFromUrl(provider: ApplyProvider, url: string): string | null {
  if (provider === "greenhouse") return url.match(/\/jobs\/(\d+)/)?.[1] ?? null;
  if (provider === "lever") return url.match(/jobs\.lever\.co\/[^/]+\/([a-f0-9-]{8,})/i)?.[1] ?? null;
  if (provider === "ashby") return url.match(/jobs\.ashbyhq\.com\/[^/]+\/([a-f0-9-]{8,})/i)?.[1] ?? null;
  return null;
}

function cleanId(provider: ApplyProvider, value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (provider === "greenhouse" && /^\d{1,20}$/.test(trimmed)) return trimmed;
  if ((provider === "lever" || provider === "ashby") && /^[a-f0-9-]{8,80}$/i.test(trimmed)) return trimmed;
  return null;
}

function targetFromUrl(url: string): ApplyTarget | null {
  const parsed = parseBoardUrl(url);
  if (!parsed) return null;
  const provider = asProvider(parsed.provider);
  if (provider === "unknown") return null;
  return {
    provider,
    boardSlug: SLUG.test(parsed.boardSlug) ? parsed.boardSlug : null,
    sourceJobId: idFromUrl(provider, url),
    jobUrl: url,
  };
}

export function resolveApplyTarget(input: {
  jobUrl: string | null;
  sourceUrl: string | null;
  sourceProvider: string | null;
  sourceJobId: string | null;
}): ApplyTarget {
  const fromJob = input.jobUrl ? targetFromUrl(input.jobUrl) : null;
  if (fromJob) {
    return {
      ...fromJob,
      sourceJobId: fromJob.sourceJobId ?? cleanId(fromJob.provider, input.sourceJobId),
    };
  }
  const fromSource = input.sourceUrl ? targetFromUrl(input.sourceUrl) : null;
  if (fromSource) {
    return {
      ...fromSource,
      sourceJobId: fromSource.sourceJobId ?? cleanId(fromSource.provider, input.sourceJobId),
      jobUrl: input.jobUrl ?? fromSource.jobUrl,
    };
  }
  const provider = asProvider(input.sourceProvider);
  return {
    provider,
    boardSlug: null,
    sourceJobId: cleanId(provider, input.sourceJobId),
    jobUrl: input.jobUrl,
  };
}

function allowedUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Application form URL must be https");
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error("Application form host is not allowed");
  return parsed.toString();
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function fallback(
  provider: ApplyProvider,
  applyUrl: string | null,
  note: string,
  error: string | null
): FetchedApplicationForm {
  return {
    provider,
    questions: standardQuestions(provider),
    source: "standard",
    applyUrl,
    note,
    error,
  };
}

async function getJson(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetchImpl(allowedUrl(url), {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "JobSearchAssistant/1.0",
      ...(init?.headers ?? {}),
    },
  });
  return { ok: response.ok, status: response.status, body: await readJson(response) };
}

async function fetchGreenhouse(
  target: ApplyTarget,
  fetchImpl: FetchLike
): Promise<FetchedApplicationForm> {
  if (!target.boardSlug || !SLUG.test(target.boardSlug) || !cleanId("greenhouse", target.sourceJobId)) {
    return fallback(
      "greenhouse",
      target.jobUrl,
      "Greenhouse questions could not be requested, so a standard question set is shown.",
      "Missing Greenhouse board or job id"
    );
  }
  const url = `https://boards-api.greenhouse.io/v1/boards/${target.boardSlug}/jobs/${target.sourceJobId}?questions=true`;
  try {
    const response = await getJson(fetchImpl, url);
    if (!response.ok) {
      return fallback(
        "greenhouse",
        target.jobUrl,
        "Greenhouse did not return this job, so a standard question set is shown.",
        `HTTP ${response.status}`
      );
    }
    const questions = parseGreenhouseQuestions(response.body);
    if (questions.length === 0) {
      return fallback(
        "greenhouse",
        greenhouseApplyUrl(response.body, target.jobUrl),
        "Greenhouse published this job without questions, so a standard question set is shown.",
        null
      );
    }
    return {
      provider: "greenhouse",
      questions,
      source: "api",
      applyUrl: greenhouseApplyUrl(response.body, target.jobUrl),
      note: null,
      error: null,
    };
  } catch (error) {
    return fallback(
      "greenhouse",
      target.jobUrl,
      "Greenhouse questions could not be fetched, so a standard question set is shown.",
      error instanceof Error ? error.message : "Greenhouse fetch failed"
    );
  }
}

async function fetchLever(target: ApplyTarget, fetchImpl: FetchLike): Promise<FetchedApplicationForm> {
  const company = target.boardSlug;
  const postingId = cleanId("lever", target.sourceJobId);
  if (!company || !SLUG.test(company) || !postingId) {
    return fallback(
      "lever",
      target.jobUrl,
      "Lever apply fields could not be requested, so the standard Lever fields are shown.",
      "Missing Lever company or posting id"
    );
  }
  const url = `https://api.lever.co/v0/postings/${company}/${postingId}`;
  try {
    const response = await getJson(fetchImpl, url);
    if (!response.ok) {
      return fallback(
        "lever",
        target.jobUrl,
        "Lever did not return this posting, so the standard Lever fields are shown.",
        `HTTP ${response.status}`
      );
    }
    const parsed = parseLeverQuestions(response.body);
    return {
      provider: "lever",
      questions: parsed.questions,
      source: "api",
      applyUrl: parsed.applyUrl ?? target.jobUrl,
      note:
        parsed.customCount > 0
          ? null
          : "Lever did not publish custom questions. Standard apply fields are filled in.",
      error: null,
    };
  } catch (error) {
    return fallback(
      "lever",
      target.jobUrl,
      "Lever apply fields could not be fetched, so the standard Lever fields are shown.",
      error instanceof Error ? error.message : "Lever fetch failed"
    );
  }
}

const ASHBY_FORM_QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    id
    applicationForm {
      fields {
        isRequired
        field {
          id
          type
          path
          title
          humanReadablePath
          selectableValues { label value }
        }
      }
    }
  }
}`;

function withQuestions(questions: FormQuestion[], applyUrl: string | null, provider: ApplyProvider): FetchedApplicationForm | null {
  if (questions.length === 0) return null;
  return { provider, questions, source: "api", applyUrl, note: null, error: null };
}

async function fetchAshby(target: ApplyTarget, fetchImpl: FetchLike): Promise<FetchedApplicationForm> {
  const board = target.boardSlug;
  const jobId = cleanId("ashby", target.sourceJobId);
  if (!board || !SLUG.test(board) || !jobId) {
    return fallback(
      "ashby",
      target.jobUrl,
      "Ashby application form could not be requested, so a standard question set is shown.",
      "Missing Ashby board or job id"
    );
  }
  try {
    const direct = await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${board}/${jobId}`);
    const directQuestions = direct.ok ? parseAshbyQuestions(direct.body) : [];
    const directForm = withQuestions(directQuestions, target.jobUrl, "ashby");
    if (directForm) return directForm;

    const list = await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${board}`);
    if (list.ok && list.body && typeof list.body === "object" && Array.isArray((list.body as { jobs?: unknown[] }).jobs)) {
      const jobs = (list.body as { jobs: Array<{ id?: string }> }).jobs.filter((job) => job.id === jobId);
      const fromList = parseAshbyQuestions({ jobs });
      const listed = withQuestions(fromList, target.jobUrl, "ashby");
      if (listed) return listed;
    }

    const graphql = await getJson(fetchImpl, "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "ApiJobPosting",
        query: ASHBY_FORM_QUERY,
        variables: { organizationHostedJobsPageName: board, jobPostingId: jobId },
      }),
    });
    const fromGraphql = graphql.ok ? parseAshbyQuestions(graphql.body) : [];
    const graphForm = withQuestions(fromGraphql, target.jobUrl, "ashby");
    if (graphForm) return graphForm;

    return fallback(
      "ashby",
      target.jobUrl,
      "The Ashby posting did not include an application form, so a standard question set is shown.",
      null
    );
  } catch (error) {
    return fallback(
      "ashby",
      target.jobUrl,
      "Ashby application form could not be fetched, so a standard question set is shown.",
      error instanceof Error ? error.message : "Ashby fetch failed"
    );
  }
}

export async function fetchApplicationForm(
  target: ApplyTarget,
  fetchImpl: FetchLike = fetchWithTimeout
): Promise<FetchedApplicationForm> {
  if (target.provider === "workday") {
    return fallback(
      "workday",
      target.jobUrl,
      "Workday does not publish application questions on a public API, so a standard question set is shown.",
      null
    );
  }
  if (target.provider === "greenhouse") return fetchGreenhouse(target, fetchImpl);
  if (target.provider === "lever") return fetchLever(target, fetchImpl);
  if (target.provider === "ashby") return fetchAshby(target, fetchImpl);
  return fallback(
    "unknown",
    target.jobUrl,
    "This job is not on a supported public apply API, so a standard question set is shown.",
    null
  );
}
