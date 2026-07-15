import type { JobSourceProvider } from "./types";

export type ParsedBoardUrl = {
  provider: JobSourceProvider;
  boardSlug: string;
  boardUrl: string;
  isSingleJob: boolean;
};

const SINGLE_JOB_PATTERNS = [
  /greenhouse\.io\/[^/]+\/jobs\/\d+/i,
  /jobs\.lever\.co\/[^/]+\/[a-f0-9-]{8,}/i,
  /jobs\.ashbyhq\.com\/[^/]+\/[a-f0-9-]{8,}/i,
];

export function isSingleJobBoardUrl(url: string): boolean {
  const trimmed = url.trim();
  return SINGLE_JOB_PATTERNS.some((p) => p.test(trimmed));
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function stripBoardListingSuffix(path: string): string {
  return path.replace(/\/jobs\/?$/i, "");
}

export function parseBoardUrl(input: string): ParsedBoardUrl | null {
  const trimmed = stripTrailingSlash(input.trim());
  if (!/^https?:\/\//i.test(trimmed)) return null;

  const ghApi = trimmed.match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/i);
  if (ghApi) {
    const slug = ghApi[1];
    return {
      provider: "greenhouse",
      boardSlug: slug,
      boardUrl: `https://boards.greenhouse.io/${slug}`,
      isSingleJob: false,
    };
  }

  const ghBoard = trimmed.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/i);
  if (ghBoard) {
    const slug = ghBoard[1];
    const isSingleJob = /\/jobs\/\d+/i.test(trimmed);
    if (isSingleJob) {
      return {
        provider: "greenhouse",
        boardSlug: slug,
        boardUrl: trimmed,
        isSingleJob: true,
      };
    }
    const normalized = stripBoardListingSuffix(trimmed);
    return {
      provider: "greenhouse",
      boardSlug: slug,
      boardUrl: normalized,
      isSingleJob: false,
    };
  }

  const leverPosting = trimmed.match(/jobs\.lever\.co\/([^/?#]+)\/([a-f0-9-]+)/i);
  if (leverPosting) {
    return {
      provider: "lever",
      boardSlug: leverPosting[1],
      boardUrl: trimmed,
      isSingleJob: true,
    };
  }

  const leverBoard = trimmed.match(/jobs\.lever\.co\/([^/?#]+)/i);
  if (leverBoard) {
    const slug = leverBoard[1];
    return {
      provider: "lever",
      boardSlug: slug,
      boardUrl: `https://jobs.lever.co/${slug}`,
      isSingleJob: false,
    };
  }

  const ashbyApi = trimmed.match(/api\.ashbyhq\.com\/posting-api\/job-board\/([^/?#]+)/i);
  if (ashbyApi) {
    const slug = ashbyApi[1];
    return {
      provider: "ashby",
      boardSlug: slug,
      boardUrl: `https://jobs.ashbyhq.com/${slug}`,
      isSingleJob: false,
    };
  }

  const ashbyJob = trimmed.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([a-f0-9-]+)/i);
  if (ashbyJob) {
    return {
      provider: "ashby",
      boardSlug: ashbyJob[1],
      boardUrl: trimmed,
      isSingleJob: true,
    };
  }

  const ashbyBoard = trimmed.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
  if (ashbyBoard) {
    const slug = ashbyBoard[1];
    return {
      provider: "ashby",
      boardSlug: slug,
      boardUrl: `https://jobs.ashbyhq.com/${slug}`,
      isSingleJob: false,
    };
  }

  return null;
}

export function normalizeBoardUrl(
  input: string,
  providerHint?: JobSourceProvider
): ParsedBoardUrl {
  const parsed = parseBoardUrl(input);
  if (!parsed) {
    throw new Error("Invalid board URL. Use a Greenhouse, Lever, or Ashby careers board link.");
  }
  if (parsed.isSingleJob) {
    throw new Error(
      "URL points to a single job posting. Use the company board URL instead (e.g. …/stripe not …/stripe/jobs/123)."
    );
  }
  if (providerHint && parsed.provider !== providerHint) {
    throw new Error(`URL looks like ${parsed.provider}, but provider is set to ${providerHint}.`);
  }
  return parsed;
}

export function extractGreenhouseBoardSlug(url: string): string | null {
  const parsed = parseBoardUrl(url);
  if (parsed?.provider === "greenhouse" && !parsed.isSingleJob) return parsed.boardSlug;
  if (parsed?.provider === "greenhouse" && parsed.isSingleJob) {
    const m = url.match(/greenhouse\.io\/([^/]+)\/jobs/i);
    return m?.[1] ?? null;
  }
  return null;
}

export function extractLeverCompanySlug(url: string): string | null {
  const parsed = parseBoardUrl(url);
  return parsed?.provider === "lever" ? parsed.boardSlug : null;
}

export function extractAshbyBoardSlug(url: string): string | null {
  const parsed = parseBoardUrl(url);
  return parsed?.provider === "ashby" ? parsed.boardSlug : null;
}
