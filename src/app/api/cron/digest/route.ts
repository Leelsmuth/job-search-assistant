import { NextResponse } from "next/server";
import { handleCronDigestRequest } from "@/lib/cron-digest-handler";

async function runDigest(request: Request) {
  const { status, body } = await handleCronDigestRequest(request.headers.get("authorization"));
  if (status >= 500) {
    console.error("[digest] request failed", body);
  }
  return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
  return runDigest(request);
}

export async function POST(request: Request) {
  return runDigest(request);
}
