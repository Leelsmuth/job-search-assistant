import { fetchWithTimeout } from "@/lib/performance/fetch-with-timeout";
import { assertPublicHttpUrl, fetchPublicHttpUrl, UnsafeUrlError } from "./ssrf";

export class BoardFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardFetchError";
  }
}

const USER_AGENT = "JobSearchAssistant/1.0";

export function assertHttpsHost(raw: string, hostPattern: RegExp): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https URLs are allowed");
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed");
  }
  if (!hostPattern.test(url.hostname)) {
    throw new UnsafeUrlError("URL host is not allowlisted");
  }
  return url;
}

export async function fetchAllowlisted(
  url: string,
  hostPattern: RegExp,
  init?: { userAgent?: string }
): Promise<Response> {
  assertHttpsHost(url, hostPattern);
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json, application/xml, text/xml, */*",
      "User-Agent": init?.userAgent ?? USER_AGENT,
    },
    timeoutMs: 20_000,
  });
  if (response.status === 429) throw new BoardFetchError("Rate limited");
  if (!response.ok) throw new BoardFetchError(`HTTP ${response.status}`);
  return response;
}

/** Tenant subdomains are public, but the host is still checked and private IPs are refused. */
export async function fetchTenant(url: string, hostPattern: RegExp): Promise<string> {
  const parsed = assertHttpsHost(url, hostPattern);
  await assertPublicHttpUrl(parsed.href);
  const response = await fetchPublicHttpUrl(parsed.href, {
    headers: {
      Accept: "application/json, application/xml, text/xml, */*",
      "User-Agent": USER_AGENT,
    },
    timeoutMs: 20_000,
  });
  if (response.status === 429) throw new BoardFetchError("Rate limited");
  if (!response.ok) throw new BoardFetchError(`HTTP ${response.status}`);
  return response.text();
}

export async function pauseBetweenDetails(): Promise<void> {
  if (process.env.VITEST === "true") return;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

export const MAX_DETAIL_FETCHES = 8;

export function titleDetailRank(title: string): number {
  if (/front-?end|react|typescript|ui engineer|web platform/i.test(title)) return 0;
  if (/engineer|developer|programmer/i.test(title)) return 1;
  return 2;
}
