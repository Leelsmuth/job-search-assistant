import { NextResponse } from "next/server";
import { handleCronDiscoverRequest } from "@/lib/cron-discover-handler";

async function runDiscover(request: Request) {
  const { status, body } = await handleCronDiscoverRequest(
    request.headers.get("authorization")
  );
  return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
  return runDiscover(request);
}

export async function POST(request: Request) {
  return runDiscover(request);
}
