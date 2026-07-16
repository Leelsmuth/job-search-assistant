import { sql, eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { companyJobSources } from "@/db/schema";
import {
  companySourcesSeedSchema,
  type CompanyJobSource,
} from "../../../data/company-sources.schema";
import verifiedCatalog from "../../../data/company-sources.verified.json";
import { ensureUniqueCatalogIds } from "./company-catalog";

let cachedJsonCatalog: CompanyJobSource[] | null = null;

function loadJsonCatalog(): CompanyJobSource[] {
  if (!cachedJsonCatalog) {
    const seed = companySourcesSeedSchema.parse(verifiedCatalog);
    const verified = seed.companies.filter(
      (c) => c.enabled && c.verificationStatus === "verified"
    );
    cachedJsonCatalog = ensureUniqueCatalogIds(verified);
  }
  return cachedJsonCatalog;
}

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

/** Loads catalog from DB when seeded; falls back to verified JSON export. */
export async function loadCompanyRegistry(): Promise<CompanyJobSource[]> {
  try {
    const db = getDb();
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companyJobSources);
    const count = countResult[0]?.count ?? 0;

    if (count > 0) {
      const rows = await db.query.companyJobSources.findMany({
        where: and(
          eq(companyJobSources.enabled, true),
          eq(companyJobSources.verificationStatus, "verified")
        ),
      });
      if (rows.length > 0) {
        return ensureUniqueCatalogIds(rows.map(rowToCompanyJobSource));
      }
    }
  } catch {
    // Table may not exist before migration; fall back to JSON.
  }

  return loadJsonCatalog();
}

export function getJsonCatalogForSeed(): CompanyJobSource[] {
  return loadJsonCatalog();
}
