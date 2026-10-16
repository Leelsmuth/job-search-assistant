import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

if (!existsSync(path.join(dist, "manifest.json")) || !existsSync(path.join(dist, "content.js"))) {
  console.error("Build the extension first: npm run build");
  process.exit(1);
}

execFileSync("zip", ["-r", "job-search-assistant.zip", ".", "-x", "job-search-assistant.zip"], {
  cwd: dist,
  stdio: "inherit",
});

console.log(`Wrote ${path.join(dist, "job-search-assistant.zip")}`);
