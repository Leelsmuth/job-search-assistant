#!/usr/bin/env tsx
/**
 * Seed company_job_sources from verified JSON export.
 * Run after applying 0006_board_health_and_registry.sql:
 *   pnpm seed:company-registry
 */
import { readFileSync } from "fs";
import { join } from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { companyJobSources } from "../src/db/schema";
import { getJsonCatalogForSeed } from "../src/modules/discovery/company-registry-db";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function main() {
  const catalog = getJsonCatalogForSeed();
  const client = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  console.log(`Seeding ${catalog.length} company job sources...`);

  const batchSize = 100;
  for (let i = 0; i < catalog.length; i += batchSize) {
    const batch = catalog.slice(i, i + batchSize);
    await db
      .insert(companyJobSources)
      .values(
        batch.map((c) => ({
          id: c.id,
          companyName: c.companyName,
          companySlug: c.companySlug,
          atsProvider: c.atsProvider,
          boardSlug: c.boardSlug,
          boardUrl: c.boardUrl,
          headquartersCountry: c.headquartersCountry,
          industries: c.industries,
          enabled: c.enabled,
          verificationStatus: c.verificationStatus,
          verifiedAt: c.verifiedAt ? new Date(c.verifiedAt) : null,
          lastJobCount: c.lastJobCount,
          observedSignals: c.observedSignals ?? null,
          discoverySource: c.discoverySource,
          lastSyncedAt: c.lastSyncedAt ? new Date(c.lastSyncedAt) : null,
        }))
      )
      .onConflictDoUpdate({
        target: companyJobSources.id,
        set: {
          companyName: companyJobSources.companyName,
          verificationStatus: companyJobSources.verificationStatus,
          lastJobCount: companyJobSources.lastJobCount,
          observedSignals: companyJobSources.observedSignals,
          lastSyncedAt: companyJobSources.lastSyncedAt,
          updatedAt: new Date(),
        },
      });
    console.log(`  ${Math.min(i + batchSize, catalog.length)} / ${catalog.length}`);
  }

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
