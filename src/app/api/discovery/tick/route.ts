import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runDiscoveryTick } from "@/lib/discovery-tick";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function runTick(request: Request) {
  const auth = verifyCronAuth(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const summary = await runDiscoveryTick();
  const status = summary.ok || summary.skipped ? 200 : 500;
  return NextResponse.json(summary, { status });
}

export async function GET(request: Request) {
  return runTick(request);
}

export async function POST(request: Request) {
  return runTick(request);
}
