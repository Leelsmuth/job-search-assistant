import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { digestAppBaseUrl } from "@/modules/digest/select";

export type DiscoverContinuation = {
  cursor: number;
  hop: number;
  runStartedAt: string;
};

/**
 * Hobby cron schedules can run at most once per day. One invocation cannot
 * walk the whole catalog, so each batch queues the next one.
 *
 * On Vercel that queue is pg_net, not fetch(). A function that fetches its own
 * deployment is answered 508 Loop Detected: the platform attaches the caller's
 * x-vercel-id to the outbound request and refuses the recursion. Supabase
 * calls the next hop from outside the deployment, with the same CRON_SECRET.
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

function continuationHeaders(secret: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  return headers;
}

function redactSecret(message: string, secret: string): string {
  const redacted = secret ? message.split(secret).join("[redacted]") : message;
  return redacted.split("\n")[0]?.slice(0, 180) || "database error";
}

/** Queue the next batch from Postgres so the HTTP call is not a Vercel self-request. */
export async function enqueueDiscoverBatch(params: DiscoverContinuation, secret: string): Promise<void> {
  const url = discoverBatchUrl(digestAppBaseUrl(), params);
  const headers = continuationHeaders(secret);
  const bypass = headers["x-vercel-protection-bypass"];
  try {
    if (bypass) {
      await getDb().execute(sql`
        select net.http_post(
          url := ${url},
          headers := jsonb_build_object(
            'Authorization', ${headers.Authorization},
            'x-vercel-protection-bypass', ${bypass}
          ),
          timeout_milliseconds := 10000
        )
      `);
      return;
    }
    await getDb().execute(sql`
      select net.http_post(
        url := ${url},
        headers := jsonb_build_object('Authorization', ${headers.Authorization}),
        timeout_milliseconds := 10000
      )
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Discovery continuation could not be queued (${redactSecret(message, secret)}).`);
  }
}

export async function kickDiscoverBatch(
  params: DiscoverContinuation,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("CRON_SECRET is not set. Add it before running discovery.");
  }
  if (process.env.VERCEL === "1") {
    await enqueueDiscoverBatch(params, secret);
    return;
  }
  const response = await fetchImpl(discoverBatchUrl(digestAppBaseUrl(), params), {
    method: "POST",
    headers: continuationHeaders(secret),
  });
  if (!response.ok) {
    throw new Error(`Discovery batch failed to start (${response.status}).`);
  }
}
