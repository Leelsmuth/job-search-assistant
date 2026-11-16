import { NextResponse } from "next/server";
import {
  createDemoLiveBatchCache,
  fetchDemoLiveBatch,
} from "@/modules/demo/live-greenhouse";
import { loadDemoLiveSnapshot, resolveDemoLiveSource } from "@/modules/demo/live-snapshot";
import type { DemoLiveBatch } from "@/modules/demo/live-jobs";

/**
 * Live jobs for the public demo. Anonymous and read-only: it takes no input and
 * only ever reads the board preselected in src/modules/demo/live-jobs.ts.
 * The middleware treats /api/demo as part of the demo, so no session is needed.
 *
 * Under `next dev`, DEMO_LIVE_JOBS_SNAPSHOT serves a saved response instead of
 * calling Greenhouse (see src/modules/demo/live-snapshot.ts).
 */
export const dynamic = "force-dynamic";

const cache = createDemoLiveBatchCache(() => fetchDemoLiveBatch());

/** Short edge cache for a fallback batch, so a recovered board shows up soon. */
const MIN_EDGE_CACHE_SECONDS = 30;

let warnedAboutIgnoredSnapshot = false;

async function loadBatch(): Promise<{ batch: DemoLiveBatch; cacheControl: string }> {
  const setting = resolveDemoLiveSource();
  if (setting.kind === "snapshot") {
    // Read on every request, so edits to the file show up right away.
    const batch = await loadDemoLiveSnapshot(setting.file);
    return { batch, cacheControl: "no-store" };
  }
  if (setting.warning && !warnedAboutIgnoredSnapshot) {
    warnedAboutIgnoredSnapshot = true;
    console.warn(`[demo] ${setting.warning}`);
  }
  const batch = await cache.get();
  const edgeSeconds = Math.max(MIN_EDGE_CACHE_SECONDS, Math.ceil(cache.freshForMs() / 1000));
  return {
    batch,
    cacheControl: `public, max-age=0, s-maxage=${edgeSeconds}, stale-while-revalidate=60`,
  };
}

export async function GET() {
  try {
    const { batch, cacheControl } = await loadBatch();
    return NextResponse.json(batch, { headers: { "Cache-Control": cacheControl } });
  } catch (error) {
    console.error(
      "[demo] live jobs unavailable",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { error: "Live jobs are unavailable right now. The sample jobs still work." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
