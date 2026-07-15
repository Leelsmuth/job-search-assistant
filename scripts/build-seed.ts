#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";
import { SEED_CANDIDATES } from "./seed-candidates";
import type { CompanyJobSource } from "../data/company-sources.schema";

function boardUrlFor(c: (typeof SEED_CANDIDATES)[0]): string {
  switch (c.atsProvider) {
    case "greenhouse":
      return `https://boards.greenhouse.io/${c.boardSlug}`;
    case "lever":
      return `https://jobs.lever.co/${c.boardSlug}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${c.boardSlug}`;
  }
}

const seen = new Set<string>();
const companies: CompanyJobSource[] = [];

for (const c of SEED_CANDIDATES) {
  const key = `${c.atsProvider}:${c.boardSlug}`;
  if (seen.has(key)) continue;
  seen.add(key);

  companies.push({
    id: c.id,
    companyName: c.companyName,
    atsProvider: c.atsProvider,
    boardUrl: boardUrlFor(c),
    boardSlug: c.boardSlug,
    companyWebsite: c.companyWebsite,
    country: c.country,
    tags: c.tags,
    enabled: true,
  });
}

const seed = {
  version: 1,
  updatedAt: new Date().toISOString(),
  companies,
};

const outPath = join(process.cwd(), "data/company-sources.seed.json");
writeFileSync(outPath, `${JSON.stringify(seed, null, 2)}\n`);
console.log(`Wrote ${companies.length} candidates to ${outPath}`);
