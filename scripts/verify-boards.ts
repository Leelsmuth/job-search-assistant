#!/usr/bin/env tsx
/**
 * Legacy wrapper — prefer `pnpm verify:registry`.
 */
import { spawnSync } from "child_process";

const args = process.argv.slice(2);
const mapped = args.map((a) => (a === "--write" ? "--write" : a));
if (!mapped.includes("--write") && args.includes("--write")) mapped.push("--write");

const result = spawnSync("tsx", ["scripts/verify-registry.ts", ...mapped, "--reverify"], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
