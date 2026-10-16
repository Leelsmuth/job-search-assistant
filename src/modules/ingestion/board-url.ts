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
  /myworkdayjobs\.com\/.+\/job\//i,
  /jobs\.smartrecruiters\.com\/[^/]+\/.+/i,
  /apply\.workable\.com\/[^/]+\/j\//i,
  /recruitee\.com\/o\//i,
  /bamboohr\.com\/careers\/\d+/i,
  /teamtailor\.com\/jobs\/.+/i,
  /jobs\.personio\.(?:de|com)\/job\//i,
  /ats\.rippling\.com\/[^/]+\/jobs\/.+/i,
];

const BOARD_SLUG = /^[a-z0-9][a-z0-9_-]{0,80}$/i;

const WORKDAY_LOCALE_SEGMENT = /^[a-z]{2}-[a-z]{2}$/i;

export type ParsedWorkdayUrl = {
  tenant: string;
  cluster: string;
  site: string;
  boardSlug: string;
  boardUrl: string;
  isSingleJob: boolean;
  externalPath?: string;
};

function tryParseHttpUrl(input: string): URL | null {
  let trimmed = input.trim().replace(/^['"]+|['"]+$/g, "").trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed.replace(/^\/+/, "")}`;
  }
  try {
    return new URL(stripTrailingSlash(trimmed));
  } catch {
    return null;
  }
}

function hostnameWithoutWww(url: URL): string {
  return url.hostname.replace(/^www\./i, "");
}

export function parseWorkdayUrl(input: string): ParsedWorkdayUrl | null {
  const url = tryParseHttpUrl(input);
  if (!url) return null;

  const host = hostnameWithoutWww(url).match(/^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/i);
  if (!host) return null;

  const tenant = host[1];
  const cluster = host[2].toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  while (segments.length > 0 && WORKDAY_LOCALE_SEGMENT.test(segments[0])) {
    segments.shift();
  }

  let site: string | undefined;
  let rest: string[];
  if (segments[0]?.toLowerCase() === "wday" && segments[1]?.toLowerCase() === "cxs") {
    site = segments[3];
    rest = segments.slice(4);
  } else {
    site = segments[0];
    rest = segments.slice(1);
  }
  if (!site || site.toLowerCase() === "job") return null;

  const jobIndex = rest.findIndex((segment) => segment.toLowerCase() === "job");
  const isSingleJob = jobIndex >= 0;
  const externalPath = isSingleJob ? `/${rest.slice(jobIndex).join("/")}` : undefined;
  const boardSlug = `${cluster}/${tenant}/${site}`;
  const canonicalBoardUrl = `https://${tenant}.${cluster}.myworkdayjobs.com/${site}`;
  const publicUrl = `${url.origin}${url.pathname}`.replace(/\/+$/, "");

  return {
    tenant,
    cluster,
    site,
    boardSlug,
    boardUrl: isSingleJob ? publicUrl : canonicalBoardUrl,
    isSingleJob,
    externalPath,
  };
}

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

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isGreenhouseHost(hostname: string): boolean {
  return /^(?:job-boards|boards)(?:\.[a-z0-9-]+)?\.greenhouse\.io$/i.test(hostname);
}

function parseGreenhouse(url: URL, hostname: string): ParsedBoardUrl | null {
  if (/^boards-api(?:\.[a-z0-9-]+)?\.greenhouse\.io$/i.test(hostname)) {
    const apiMatch = url.pathname.match(/\/v1\/boards\/([^/]+)/i);
    if (!apiMatch) return null;
    const slug = decodeSlug(apiMatch[1]);
    return {
      provider: "greenhouse",
      boardSlug: slug,
      boardUrl: `https://boards.greenhouse.io/${slug}`,
      isSingleJob: false,
    };
  }

  if (!isGreenhouseHost(hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const forToken = url.searchParams.get("for");
  if (segments[0]?.toLowerCase() === "embed" || (segments.length === 0 && forToken)) {
    if (!forToken) return null;
    const slug = decodeSlug(forToken);
    const isSingleJob = segments.some((segment) => segment.toLowerCase() === "job_app");
    return {
      provider: "greenhouse",
      boardSlug: slug,
      boardUrl: isSingleJob ? url.toString().replace(/\/+$/, "") : `https://${hostname}/${slug}`,
      isSingleJob,
    };
  }

  const slug = segments[0] ? decodeSlug(segments[0]) : "";
  if (!slug || slug.toLowerCase() === "embed") return null;
  const isSingleJob = /\/jobs\/\d+/i.test(url.pathname);
  if (isSingleJob) {
    return {
      provider: "greenhouse",
      boardSlug: slug,
      boardUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, ""),
      isSingleJob: true,
    };
  }

  return {
    provider: "greenhouse",
    boardSlug: slug,
    boardUrl: stripBoardListingSuffix(`https://${hostname}/${slug}`),
    isSingleJob: false,
  };
}

function parseLever(url: URL, hostname: string): ParsedBoardUrl | null {
  if (/^api(?:\.[a-z0-9-]+)?\.lever\.co$/i.test(hostname)) {
    const apiMatch = url.pathname.match(/\/v0\/postings\/([^/]+)(?:\/([^/]+))?/i);
    if (!apiMatch) return null;
    const slug = decodeSlug(apiMatch[1]);
    const postingId = apiMatch[2];
    const isSingleJob = Boolean(postingId && /^[a-f0-9-]{8,}$/i.test(postingId));
    return {
      provider: "lever",
      boardSlug: slug,
      boardUrl: isSingleJob ? `${url.origin}${url.pathname}`.replace(/\/+$/, "") : `https://jobs.lever.co/${slug}`,
      isSingleJob,
    };
  }

  if (!/^jobs(?:\.[a-z0-9-]+)?\.lever\.co$/i.test(hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = segments[0] ? decodeSlug(segments[0]) : "";
  if (!slug) return null;
  const postingId = segments[1];
  const isSingleJob = Boolean(postingId && /^[a-f0-9-]{8,}$/i.test(postingId));
  return {
    provider: "lever",
    boardSlug: slug,
    boardUrl: isSingleJob
      ? `${url.origin}${url.pathname}`.replace(/\/+$/, "")
      : `https://jobs.lever.co/${slug}`,
    isSingleJob,
  };
}

function parseAshby(url: URL, hostname: string): ParsedBoardUrl | null {
  if (/^api\.ashbyhq\.com$/i.test(hostname)) {
    const apiMatch = url.pathname.match(/\/posting-api\/job-board\/([^/]+)/i);
    if (!apiMatch) return null;
    const slug = decodeSlug(apiMatch[1]);
    return {
      provider: "ashby",
      boardSlug: slug,
      boardUrl: `https://jobs.ashbyhq.com/${slug}`,
      isSingleJob: false,
    };
  }

  if (!/^jobs\.ashbyhq\.com$/i.test(hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = segments[0] ? decodeSlug(segments[0]) : "";
  if (!slug || slug.toLowerCase() === "embed") return null;
  const postingId = segments[1];
  const isSingleJob = Boolean(
    postingId && postingId.toLowerCase() !== "embed" && /^[a-f0-9-]{8,}$/i.test(postingId)
  );
  return {
    provider: "ashby",
    boardSlug: slug,
    boardUrl: isSingleJob
      ? `${url.origin}${url.pathname}`.replace(/\/+$/, "")
      : `https://jobs.ashbyhq.com/${slug}`,
    isSingleJob,
  };
}

function safeSlug(value: string): string | null {
  const slug = decodeSlug(value);
  return BOARD_SLUG.test(slug) ? slug : null;
}

function publicPath(url: URL): string {
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

function parseSmartRecruiters(url: URL, hostname: string): ParsedBoardUrl | null {
  if (/^api\.smartrecruiters\.com$/i.test(hostname)) {
    const api = url.pathname.match(/\/v1\/companies\/([^/]+)(?:\/postings\/([^/]+))?/i);
    if (!api) return null;
    const slug = safeSlug(api[1]);
    if (!slug) return null;
    const isSingleJob = Boolean(api[2]);
    return {
      provider: "smartrecruiters",
      boardSlug: slug,
      boardUrl: isSingleJob ? publicPath(url) : `https://jobs.smartrecruiters.com/${slug}`,
      isSingleJob,
    };
  }
  if (!/^jobs\.smartrecruiters\.com$/i.test(hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = segments[0] ? safeSlug(segments[0]) : null;
  if (!slug) return null;
  const isSingleJob = segments.length > 1;
  return {
    provider: "smartrecruiters",
    boardSlug: slug,
    boardUrl: isSingleJob ? publicPath(url) : `https://jobs.smartrecruiters.com/${slug}`,
    isSingleJob,
  };
}

function parseWorkable(url: URL, hostname: string): ParsedBoardUrl | null {
  if (/^www\.workable\.com$/i.test(hostname)) {
    const api = url.pathname.match(/\/api\/accounts\/([^/]+)/i);
    if (!api) return null;
    const slug = safeSlug(api[1]);
    if (!slug) return null;
    return {
      provider: "workable",
      boardSlug: slug,
      boardUrl: `https://apply.workable.com/${slug}`,
      isSingleJob: false,
    };
  }
  if (!/^(?:apply|jobs)\.workable\.com$/i.test(hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = segments[0] ? safeSlug(segments[0]) : null;
  if (!slug) return null;
  const second = segments[1]?.toLowerCase();
  const isSingleJob = second === "j" || second === "jobs";
  return {
    provider: "workable",
    boardSlug: slug,
    boardUrl: isSingleJob ? publicPath(url) : `https://apply.workable.com/${slug}`,
    isSingleJob,
  };
}

function parseRecruitee(url: URL, hostname: string): ParsedBoardUrl | null {
  const host = hostname.match(/^([a-z0-9-]+)\.recruitee\.com$/i);
  if (!host) return null;
  const slug = safeSlug(host[1]);
  if (!slug || /^(?:www|api|app|blog|status)$/i.test(slug)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const isSingleJob = /^(?:o|offers)$/i.test(segments[0] ?? "");
  return {
    provider: "recruitee",
    boardSlug: slug,
    boardUrl: isSingleJob ? publicPath(url) : `https://${slug}.recruitee.com`,
    isSingleJob,
  };
}

function parseBambooHr(url: URL, hostname: string): ParsedBoardUrl | null {
  const host = hostname.match(/^([a-z0-9-]+)\.bamboohr\.com$/i);
  if (!host) return null;
  const slug = safeSlug(host[1]);
  if (!slug || /^(?:www|api|app)$/i.test(slug)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const careersIndex = segments.findIndex((segment) => segment.toLowerCase() === "careers");
  if (careersIndex < 0) return null;
  const after = segments[careersIndex + 1];
  const isSingleJob = Boolean(after && after.toLowerCase() !== "list" && /^\d+$/.test(after));
  return {
    provider: "bamboohr",
    boardSlug: slug,
    boardUrl: isSingleJob ? publicPath(url) : `https://${slug}.bamboohr.com/careers`,
    isSingleJob,
  };
}

function parseTeamtailor(url: URL, hostname: string): ParsedBoardUrl | null {
  const host = hostname.match(/^([a-z0-9-]+)\.teamtailor\.com$/i);
  if (!host) return null;
  const slug = safeSlug(host[1]);
  if (!slug || /^(?:www|api|app|support)$/i.test(slug)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const jobsIndex = segments.findIndex((segment) => /^jobs(?:\.rss)?$/i.test(segment));
  if (jobsIndex < 0 && segments.length > 0) return null;
  const after = jobsIndex >= 0 ? segments[jobsIndex + 1] : undefined;
  const isSingleJob = Boolean(after);
  return {
    provider: "teamtailor",
    boardSlug: slug,
    boardUrl: isSingleJob ? publicPath(url) : `https://${slug}.teamtailor.com/jobs`,
    isSingleJob,
  };
}

function parsePersonio(url: URL, hostname: string): ParsedBoardUrl | null {
  const host = hostname.match(/^([a-z0-9-]+)\.jobs\.personio\.(de|com)$/i);
  if (!host) return null;
  const company = safeSlug(host[1]);
  if (!company) return null;
  const tld = host[2].toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  const isSingleJob = segments[0]?.toLowerCase() === "job";
  return {
    provider: "personio",
    boardSlug: `${company}.${tld}`,
    boardUrl: isSingleJob ? publicPath(url) : `https://${company}.jobs.personio.${tld}`,
    isSingleJob,
  };
}

function parseRippling(url: URL, hostname: string): ParsedBoardUrl | null {
  if (!/^ats\.rippling\.com$/i.test(hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = segments[0] ? safeSlug(segments[0]) : null;
  if (!slug) return null;
  if (segments.length > 1 && segments[1]?.toLowerCase() !== "jobs") return null;
  const isSingleJob = Boolean(segments[2]);
  return {
    provider: "rippling",
    boardSlug: slug,
    boardUrl: isSingleJob ? publicPath(url) : `https://ats.rippling.com/${slug}/jobs`,
    isSingleJob,
  };
}

export function parseBoardUrl(input: string): ParsedBoardUrl | null {
  const url = tryParseHttpUrl(input);
  if (!url) return null;
  const hostname = hostnameWithoutWww(url);

  return (
    parseGreenhouse(url, hostname) ??
    parseLever(url, hostname) ??
    parseAshby(url, hostname) ??
    (() => {
      const workday = parseWorkdayUrl(url.toString());
      if (!workday) return null;
      return {
        provider: "workday" as const,
        boardSlug: workday.boardSlug,
        boardUrl: workday.boardUrl,
        isSingleJob: workday.isSingleJob,
      };
    })() ??
    parseSmartRecruiters(url, hostname) ??
    parseWorkable(url, hostname) ??
    parseRecruitee(url, hostname) ??
    parseBambooHr(url, hostname) ??
    parseTeamtailor(url, hostname) ??
    parsePersonio(url, hostname) ??
    parseRippling(url, hostname)
  );
}

export function normalizeBoardUrl(
  input: string,
  providerHint?: JobSourceProvider
): ParsedBoardUrl {
  const parsed = parseBoardUrl(input);
  if (!parsed) {
    throw new Error(
      "Invalid board URL. Use a Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee, BambooHR, Teamtailor, Personio, or Rippling careers board link."
    );
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
