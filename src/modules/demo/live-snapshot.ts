/**
 * Development-only snapshot mode for the demo's live jobs.
 *
 * For environments that cannot reach Greenhouse (sandboxes, locked-down CI,
 * offline work). With DEMO_LIVE_JOBS_SNAPSHOT set, `next dev` serves a saved
 * Greenhouse list response instead of calling Greenhouse. The batch is marked
 * `source: "snapshot"` and the demo labels it as not live.
 *
 *   DEMO_LIVE_JOBS_SNAPSHOT=1               bundled sample response
 *   DEMO_LIVE_JOBS_SNAPSHOT=path/to/file    your own saved response, e.g.
 *     curl -o tmp/greenhouse.json https://boards-api.greenhouse.io/v1/boards/tailscale/jobs
 *
 * Ignored unless NODE_ENV is "development": production builds (including
 * Vercel previews) always call Greenhouse and log a warning if it is set.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pickDemoLiveBatch, DemoLiveJobsError } from "./live-greenhouse";
import type { DemoLiveBatch } from "./live-jobs";

export const DEMO_LIVE_SNAPSHOT_ENV = "DEMO_LIVE_JOBS_SNAPSHOT";

/** Relative to the project root. */
export const DEFAULT_DEMO_LIVE_SNAPSHOT = "src/modules/demo/snapshots/greenhouse-tailscale.json";

export type DemoLiveSourceSetting =
  | { kind: "greenhouse"; warning?: string }
  | { kind: "snapshot"; file: string };

const OFF_VALUES = new Set(["", "0", "false", "off", "no"]);
const DEFAULT_VALUES = new Set(["1", "true", "on", "yes"]);

export function resolveDemoLiveSource(
  env: { readonly [key: string]: string | undefined } = process.env,
  cwd: string = process.cwd()
): DemoLiveSourceSetting {
  const raw = env[DEMO_LIVE_SNAPSHOT_ENV]?.trim() ?? "";
  if (OFF_VALUES.has(raw.toLowerCase())) return { kind: "greenhouse" };
  if (env.NODE_ENV !== "development") {
    return {
      kind: "greenhouse",
      warning: `${DEMO_LIVE_SNAPSHOT_ENV} is set but ignored: snapshot mode only runs under next dev (NODE_ENV=${env.NODE_ENV ?? "unset"}).`,
    };
  }
  const file = DEFAULT_VALUES.has(raw.toLowerCase()) ? DEFAULT_DEMO_LIVE_SNAPSHOT : raw;
  return { kind: "snapshot", file: path.resolve(cwd, file) };
}

/**
 * Read a saved Greenhouse list response and run it through the same selection
 * as the live route, so the demo shows what Greenhouse data would look like.
 */
export async function loadDemoLiveSnapshot(file: string, now: Date = new Date()): Promise<DemoLiveBatch> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    throw new DemoLiveJobsError(
      `Snapshot ${file} could not be read${typeof code === "string" ? ` (${code})` : ""}`
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new DemoLiveJobsError(`Snapshot ${file} is not valid JSON`);
  }
  return { ...pickDemoLiveBatch(payload, now), source: "snapshot" };
}
