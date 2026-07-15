import { NextResponse } from "next/server";
import { handleCronDiscoverRequest } from "@/lib/cron-discover-handler";

export async function GET(request: Request) {
  const { status, body } = await handleCronDiscoverRequest(
    request.headers.get("authorization")
  );
  return NextResponse.json(body, { status });
}
