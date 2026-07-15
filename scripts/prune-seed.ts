#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { companySourcesSeedSchema } from "../data/company-sources.schema";

const path = join(process.cwd(), "data/company-sources.seed.json");
const raw = JSON.parse(readFileSync(path, "utf-8"));
const seed = companySourcesSeedSchema.parse(raw);

const kept = seed.companies.filter((c) => c.enabled && c.verifiedAt);
const seenIds = new Set<string>();

const companies = kept.map((c) => {
  let id = c.id;
  if (seenIds.has(id)) {
    id = `${c.id}-${c.atsProvider}`;
  }
  seenIds.add(id);
  return { ...c, id };
});

const pruned = {
  version: seed.version,
  updatedAt: new Date().toISOString(),
  companies,
};

writeFileSync(path, `${JSON.stringify(pruned, null, 2)}\n`);
console.log(`Pruned to ${companies.length} verified enabled companies`);
