import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "discovery-sources") continue;
      collectSourceFiles(path, acc);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      acc.push(path);
    }
  }
  return acc;
}

describe("discovery catalog runtime safety", () => {
  it("does not read company-sources.seed.json from disk in app modules", () => {
    const discoveryDir = join(process.cwd(), "src/modules/discovery");
    const files = collectSourceFiles(discoveryDir);
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        source.includes("company-sources.seed.json") ||
        (source.includes("readFileSync") && source.includes("company-sources"))
      );
    });

    expect(offenders).toEqual([]);
  });

  it("loads bundled verified catalog without throwing", async () => {
    const { loadBundledVerifiedCatalog } = await import(
      "@/modules/discovery/verified-catalog-bundle"
    );
    const catalog = loadBundledVerifiedCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0]?.boardUrl).toMatch(/^https?:\/\//);
  });
});
