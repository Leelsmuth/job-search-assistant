import { sql, eq, and } from "drizzle-orm";
import { DB_STATEMENT_TIMEOUT_MS, getDb } from "@/db/client";
import { companyJobSources } from "@/db/schema";
import type { CompanyJobSource } from "../../../data/company-sources.schema";
import { ensureUniqueCatalogIds } from "./company-catalog";
import { loadBundledVerifiedCatalog } from "./verified-catalog-bundle";

function rowToCompanyJobSource(row: typeof companyJobSources.$inferSelect): CompanyJobSource {
  return {
    id: row.id,
    companyName: row.companyName,
    companySlug: row.companySlug,
    atsProvider: row.atsProvider as CompanyJobSource["atsProvider"],
    boardSlug: row.boardSlug,
    boardUrl: row.boardUrl,
    headquartersCountry: row.headquartersCountry ?? undefined,
    industries: row.industries ?? [],
    enabled: row.enabled,
    verificationStatus: row.verificationStatus as CompanyJobSource["verificationStatus"],
    verifiedAt: row.verifiedAt?.toISOString(),
    lastJobCount: row.lastJobCount ?? undefined,
    observedSignals: row.observedSignals as CompanyJobSource["observedSignals"],
    discoverySource: row.discoverySource ?? undefined,
    lastSyncedAt: row.lastSyncedAt?.toISOString(),
  };
}

async function loadCatalogFromDb(): Promise<CompanyJobSource[] | null> {
  const db = getDb();
  // Own transaction on the owner role. Do not call this from inside withUserDb:
  // that callback already holds a pooled connection, and this checkout needs another.
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('statement_timeout', ${String(DB_STATEMENT_TIMEOUT_MS)}, true)`
    );
    const countResult = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(companyJobSources);
    const count = countResult[0]?.count ?? 0;

    if (count === 0) return null;

    const rows = await tx.query.companyJobSources.findMany({
      where: and(
        eq(companyJobSources.enabled, true),
        eq(companyJobSources.verificationStatus, "verified")
      ),
    });

    if (rows.length === 0) return null;
    return ensureUniqueCatalogIds(rows.map(rowToCompanyJobSource));
  });
}

function loadCatalogFromBundle(): CompanyJobSource[] {
  try {
    return loadBundledVerifiedCatalog();
  } catch (error) {
    console.error("[discovery] bundled catalog failed to load", error);
    return [];
  }
}

/**
 * Loads catalog from DB when seeded; falls back to bundled verified JSON (never disk I/O).
 * Uses the owner connection (getDb), not withUserDb. company_job_sources has no RLS,
 * and this must run outside a user transaction so it does not need a second pool slot
 * while SET LOCAL ROLE authenticated is in effect.
 */
export async function loadCompanyRegistry(): Promise<CompanyJobSource[]> {
  try {
    const fromDb = await loadCatalogFromDb();
    if (fromDb && fromDb.length > 0) {
      return fromDb;
    }
  } catch (error) {
    // Table may not exist before migration; fall back to bundled JSON.
    console.warn("[discovery] DB catalog unavailable, using bundled export", error);
  }

  return loadCatalogFromBundle();
}

export function getJsonCatalogForSeed(): CompanyJobSource[] {
  return loadBundledVerifiedCatalog();
}
