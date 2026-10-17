import { after, NextResponse } from "next/server";
import { handleCronDiscoverRequest, MAX_DISCOVER_HOPS } from "@/lib/cron-discover-handler";
import { kickDiscoverBatch, parseDiscoverContinuation } from "@/lib/cron-discover-kick";
import { verifyCronAuth } from "@/lib/cron-auth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function runDiscover(request: Request) {
  const authHeader = request.headers.get("authorization");
  const auth = verifyCronAuth(authHeader);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = parseDiscoverContinuation(new URL(request.url));
  if (params.hop >= MAX_DISCOVER_HOPS) {
    return NextResponse.json({ ok: true, stopped: true, reason: "hop limit" });
  }

  // Respond before the board fetches. after() runs one batch, then
  // kickDiscoverBatch queues the next hop. On Vercel that queue is pg_net:
  // fetching this deployment from the function itself returns 508.
  after(async () => {
    try {
      const { body } = await handleCronDiscoverRequest(authHeader, {
        cursor: params.cursor,
        hop: params.hop,
        runStartedAt: new Date(params.runStartedAt),
      });
      const continuation = body.continuation;
      if (
        continuation &&
        typeof continuation === "object" &&
        "cursor" in continuation &&
        "hop" in continuation &&
        "runStartedAt" in continuation
      ) {
        await kickDiscoverBatch({
          cursor: Number(continuation.cursor),
          hop: Number(continuation.hop),
          runStartedAt: String(continuation.runStartedAt),
        });
      }
    } catch (error) {
      console.error("[cron] discover batch failed", error);
    }
  });

  return NextResponse.json({
    accepted: true,
    cursor: params.cursor,
    hop: params.hop,
    runStartedAt: params.runStartedAt,
  });
}

export async function GET(request: Request) {
  return runDiscover(request);
}

export async function POST(request: Request) {
  return runDiscover(request);
}
