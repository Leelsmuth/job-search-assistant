import { verifyCronAuth } from "@/lib/cron-auth";
import { NextResponse } from "next/server";

/**
 * Registry re-verification cron hook.
 * Full verification runs via `pnpm verify:registry --reverify --write` (network-heavy).
 * This endpoint confirms cron auth and returns operator instructions.
 */
export async function GET(request: Request) {
  const auth = verifyCronAuth(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    ok: true,
    message:
      "Registry re-verify is not run inline. Execute locally or in CI: pnpm verify:registry --reverify --write",
    docs: "See README.md — Company catalog maintenance",
  });
}

export async function POST(request: Request) {
  return GET(request);
}
