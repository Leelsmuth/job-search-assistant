export type PageProvider =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "linkedin"
  | "indeed"
  | "other";

const TRACKING = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gh_src",
  "lever-origin",
  "lever-source",
]);

export function canonicalPageUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    url.hash = "";
    const kept = new URLSearchParams();
    for (const [key, item] of url.searchParams) {
      if (!TRACKING.has(key.toLowerCase())) kept.append(key, item);
    }
    url.search = kept.toString() ? `?${kept.toString()}` : "";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${path}${url.search}`;
  } catch {
    return null;
  }
}

export function detectPageProvider(value: string): PageProvider {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "other";
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "greenhouse.io" || host.endsWith(".greenhouse.io")) return "greenhouse";
  if (host === "jobs.lever.co") return "lever";
  if (host === "jobs.ashbyhq.com") return "ashby";
  if (host.endsWith(".myworkdayjobs.com") || host.endsWith(".myworkdaysite.com")) return "workday";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "indeed.com" || host.endsWith(".indeed.com")) return "indeed";
  return "other";
}

export function sourceJobIdFromUrl(value: string): string | null {
  const provider = detectPageProvider(value);
  if (provider === "greenhouse") {
    return value.match(/\/jobs\/(\d+)/)?.[1] ?? value.match(/[?&]token=(\d+)/)?.[1] ?? null;
  }
  if (provider === "lever") {
    return value.match(/jobs\.lever\.co\/[^/]+\/([a-f0-9-]{8,})/i)?.[1]?.toLowerCase() ?? null;
  }
  if (provider === "ashby") {
    return value.match(/jobs\.ashbyhq\.com\/[^/]+\/([a-f0-9-]{8,})/i)?.[1]?.toLowerCase() ?? null;
  }
  if (provider === "workday") {
    const match = value.match(/(?:_|\b)(R-?\d{3,}|JR\d{3,})/i);
    return match ? match[1].toUpperCase().replace(/-/g, "") : null;
  }
  return null;
}

function jobKey(value: string): string | null {
  const provider = detectPageProvider(value);
  const id = sourceJobIdFromUrl(value);
  if (!provider || provider === "other" || provider === "linkedin" || provider === "indeed" || !id) {
    return null;
  }
  if (provider === "greenhouse") {
    const slug = value.match(/greenhouse\.io\/([^/?#]+)\/jobs\//i)?.[1]?.toLowerCase();
    return slug ? `greenhouse:${slug}:${id}` : `greenhouse:${id}`;
  }
  if (provider === "lever") {
    const slug = value.match(/jobs\.lever\.co\/([^/?#]+)\//i)?.[1]?.toLowerCase();
    return slug ? `lever:${slug}:${id}` : null;
  }
  if (provider === "ashby") {
    const slug = value.match(/jobs\.ashbyhq\.com\/([^/?#]+)\//i)?.[1]?.toLowerCase();
    return slug ? `ashby:${slug}:${id}` : null;
  }
  return `workday:${id}`;
}

export function urlsReferToSameJob(left: string, right: string): boolean {
  const a = canonicalPageUrl(left);
  const b = canonicalPageUrl(right);
  if (a && b && a === b) return true;
  const leftKey = jobKey(left);
  const rightKey = jobKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function isFinalReviewStep(headings: string[]): boolean {
  return headings.some((heading) => {
    const text = heading.trim().toLowerCase();
    if (!text || text.length > 80) return false;
    return /\breview\b/.test(text) && !/\bpreview\b/.test(text);
  });
}

export function isNavigationControl(label: string): boolean {
  const text = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;
  return /submit|apply now|apply for this|save and continue|^next$|^continue$|^review$/.test(text);
}
