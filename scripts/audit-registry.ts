#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  companySourcesSeedSchema,
  type CompanyJobSource,
} from "../data/company-sources.schema";
import { auditRegistry } from "../src/modules/discovery/registry/merge";
import { boardIdentityKey } from "../src/modules/discovery/registry/board-identity";

const SEED_PATH = join(process.cwd(), "data/company-sources.seed.json");

function migrateLegacyEntry(c: Record<string, unknown>): CompanyJobSource {
  const tags = (c.tags as string[] | undefined) ?? [];
  const industries = tags.filter(
    (t) => !["remote-canada", "frontend-heavy", "remote-friendly"].includes(t)
  );

  const country = c.country as string | undefined;
  let headquartersCountry = c.headquartersCountry as string | undefined;
  if (!headquartersCountry && country) {
    headquartersCountry = country === "CA" ? "CA" : country === "US" ? "US" : undefined;
  }

  const verifiedAt = c.verifiedAt as string | undefined;
  const verificationStatus =
    (c.verificationStatus as CompanyJobSource["verificationStatus"]) ??
    (verifiedAt ? "verified" : "verification_failed");

  return {
    id: c.id as string,
    companyName: c.companyName as string,
    companySlug:
      (c.companySlug as string) ??
      (c.id as string).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    atsProvider: c.atsProvider as CompanyJobSource["atsProvider"],
    boardSlug: c.boardSlug as string,
    boardUrl: c.boardUrl as string,
    companyWebsite: c.companyWebsite as string | undefined,
    careersUrl: c.careersUrl as string | undefined,
    headquartersCountry,
    companyCountries: c.companyCountries as string[] | undefined,
    industries: (c.industries as string[] | undefined) ?? industries,
    enabled: (c.enabled as boolean | undefined) ?? true,
    verificationStatus,
    verifiedAt,
    lastJobCount: c.lastJobCount as number | undefined,
    verificationError: (c.verificationError ?? c.lastVerifyError) as string | undefined,
    observedSignals: c.observedSignals as CompanyJobSource["observedSignals"],
    discoverySource: c.discoverySource as string | undefined,
    lastSyncedAt: c.lastSyncedAt as string | undefined,
  };
}

function dedupeByBoard(companies: CompanyJobSource[]): CompanyJobSource[] {
  const byBoard = new Map<string, CompanyJobSource>();
  for (const entry of companies) {
    const key = boardIdentityKey({
      provider: entry.atsProvider,
      boardSlug: entry.boardSlug,
    });
    const existing = byBoard.get(key);
    if (!existing) {
      byBoard.set(key, entry);
      continue;
    }
    const prefer =
      entry.verificationStatus === "verified" &&
      existing.verificationStatus !== "verified"
        ? entry
        : existing;
    byBoard.set(key, prefer);
  }
  return Array.from(byBoard.values());
}

function main() {
  if (!existsSync(SEED_PATH)) {
    console.error(`Seed not found: ${SEED_PATH}`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(SEED_PATH, "utf-8"));
  const companies = (raw.companies as Record<string, unknown>[]).map(migrateLegacyEntry);
  const deduped = dedupeByBoard(companies);

  const report = auditRegistry(companies);
  const reportAfter = auditRegistry(deduped);

  console.log("=== Registry Audit (before dedupe) ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("\n=== After board dedupe ===");
  console.log(`Total: ${reportAfter.total} (removed ${companies.length - deduped.length})`);
  console.log("By provider:", reportAfter.byProvider);
  console.log("By status:", reportAfter.byVerificationStatus);
  console.log("Legacy candidate tags:", reportAfter.legacyTagsFound);

  const migrated = {
    version: 2,
    updatedAt: new Date().toISOString(),
    companies: deduped.sort((a, b) => a.companyName.localeCompare(b.companyName)),
  };

  companySourcesSeedSchema.parse(migrated);
  writeFileSync(SEED_PATH, `${JSON.stringify(migrated, null, 2)}\n`);
  console.log(`\nMigrated ${deduped.length} entries to schema v2 at ${SEED_PATH}`);
}

main();
