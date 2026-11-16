/**
 * Diagnose the demo's live jobs from this machine: `pnpm check:demo-live`.
 * Calls the same Greenhouse endpoint as GET /api/demo/live-jobs, prints what
 * Greenhouse actually answered, then runs the route's code path on it.
 */
import { DEMO_LIVE_BOARD } from "../src/modules/demo/live-jobs";
import { DEMO_LIVE_BOARD_API_URL, fetchDemoLiveBatch } from "../src/modules/demo/live-greenhouse";
import {
  DEMO_LIVE_SNAPSHOT_ENV,
  loadDemoLiveSnapshot,
  resolveDemoLiveSource,
} from "../src/modules/demo/live-snapshot";

async function main() {
  console.log(`Board: ${DEMO_LIVE_BOARD.companyName} (${DEMO_LIVE_BOARD.boardSlug}) on Greenhouse`);
  console.log(`GET ${DEMO_LIVE_BOARD_API_URL}\n`);

  try {
    const response = await fetch(DEMO_LIVE_BOARD_API_URL, { headers: { Accept: "application/json" } });
    const body = await response.text();
    console.log(`Raw answer: HTTP ${response.status}, ${response.headers.get("content-type") ?? "no content-type"}, ${body.length} bytes`);
    try {
      const parsed = JSON.parse(body) as { jobs?: unknown };
      console.log(
        Array.isArray(parsed.jobs)
          ? `  ${parsed.jobs.length} jobs on the board`
          : `  JSON without a jobs list: ${body.slice(0, 200)}`
      );
    } catch {
      console.log(`  Not JSON: ${body.replace(/\s+/g, " ").slice(0, 200)}`);
    }
    if (response.status === 404) {
      console.log(
        `  404: Greenhouse has no public board named "${DEMO_LIVE_BOARD.boardSlug}". Check where the company's careers page links, and update DEMO_LIVE_BOARD in src/modules/demo/live-jobs.ts.`
      );
    }
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    console.log(`Raw request failed: ${cause?.code ?? ""} ${cause?.message ?? String(error)}`);
    console.log("  This machine cannot reach Greenhouse (DNS, firewall, proxy, or TLS inspection).");
  }

  console.log("\nRoute code path (fetchDemoLiveBatch):");
  try {
    const batch = await fetchDemoLiveBatch();
    console.log(`  OK: ${batch.jobs.length} of ${batch.totalOpenings} openings kept`);
    for (const job of batch.jobs) console.log(`  - ${job.title} · ${job.location ?? "no location"}`);
  } catch (error) {
    console.log(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

async function checkSnapshot() {
  const raw = process.env[DEMO_LIVE_SNAPSHOT_ENV];
  if (!raw) return;
  // Report what `next dev` would do with the current value.
  const setting = resolveDemoLiveSource({ ...process.env, NODE_ENV: "development" });
  console.log(`\n${DEMO_LIVE_SNAPSHOT_ENV}=${raw} (used by next dev only):`);
  if (setting.kind !== "snapshot") {
    console.log("  Off.");
    return;
  }
  try {
    const batch = await loadDemoLiveSnapshot(setting.file);
    console.log(`  OK: ${setting.file}, ${batch.jobs.length} of ${batch.totalOpenings} openings kept`);
  } catch (error) {
    console.log(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

void main().then(checkSnapshot);
