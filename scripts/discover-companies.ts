#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { companySourcesSeedSchema } from "../data/company-sources.schema";
import {
  AtsUrlImportDiscoverySource,
  CommonCrawlSlugDiscoverySource,
  SeedFileDiscoverySource,
} from "../src/modules/discovery/registry/discovery-sources";
import { mergeRegistryEntries } from "../src/modules/discovery/registry/merge";
import type { DiscoveredCompanyCandidate } from "../src/modules/discovery/registry/discovery-sources/types";

const SEED_PATH = join(process.cwd(), "data/company-sources.seed.json");

async function main() {
  const sources = [
    new SeedFileDiscoverySource(),
    new CommonCrawlSlugDiscoverySource(),
    new AtsUrlImportDiscoverySource(),
  ];

  let allCandidates: DiscoveredCompanyCandidate[] = [];
  for (const source of sources) {
    const found = await source.discover();
    console.log(`${source.name}: ${found.length} candidates`);
    allCandidates = allCandidates.concat(found);
  }

  const existing = existsSync(SEED_PATH)
    ? companySourcesSeedSchema.parse(JSON.parse(readFileSync(SEED_PATH, "utf-8"))).companies
    : [];

  const merged = mergeRegistryEntries(existing, allCandidates);
  const seed = {
    version: 2,
    updatedAt: new Date().toISOString(),
    companies: merged,
  };

  companySourcesSeedSchema.parse(seed);
  writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`);

  const verified = merged.filter((c) => c.verificationStatus === "verified").length;
  console.log(`\nRegistry: ${merged.length} total entries (${verified} verified)`);
  console.log(`Wrote ${SEED_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
