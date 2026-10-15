import { digestAppBaseUrl } from "@/modules/digest/select";

export type DiscoverContinuation = {
  cursor: number;
  hop: number;
  runStartedAt: string;
};

/**
 * Hobby cron schedules can run at most once per day, and a function invocation
 * is capped at 60s. The 08:00 UTC discover cron (and the manual button) start
 * one batch, then this request starts the next batch with the same CRON_SECRET
 * the platform sends. The 12:00 UTC digest stays later in the day.
 */
export function discoverBatchUrl(origin: string, params: DiscoverContinuation): string {
  const url = new URL("/api/cron/discover", origin);
  url.searchParams.set("cursor", String(params.cursor));
  url.searchParams.set("hop", String(params.hop));
  url.searchParams.set("runStartedAt", params.runStartedAt);
  return url.toString();
}

export function parseDiscoverContinuation(url: URL, now = new Date()): DiscoverContinuation {
  const cursor = Number(url.searchParams.get("cursor") ?? "0");
  const hop = Number(url.searchParams.get("hop") ?? "0");
  const rawStart = url.searchParams.get("runStartedAt");
  const parsedStart = rawStart ? Date.parse(rawStart) : Number.NaN;
  return {
    cursor: Number.isInteger(cursor) && cursor >= 0 ? cursor : 0,
    hop: Number.isInteger(hop) && hop >= 0 ? hop : 0,
    runStartedAt: Number.isNaN(parsedStart) ? now.toISOString() : new Date(parsedStart).toISOString(),
  };
}

export async function kickDiscoverBatch(
  params: DiscoverContinuation,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("CRON_SECRET is not set. Add it before running discovery.");
  }
  const headers: Record<string, string> = { authorization: `Bearer ${secret}` };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const response = await fetchImpl(discoverBatchUrl(digestAppBaseUrl(), params), {
    method: "POST",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Discovery batch failed to start (${response.status}).`);
  }
}
