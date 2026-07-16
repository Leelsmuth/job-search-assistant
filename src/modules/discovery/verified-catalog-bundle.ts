import {
  companySourcesSeedSchema,
  type CompanyJobSource,
} from "../../../data/company-sources.schema";
import verifiedCatalog from "../../../data/company-sources.verified.json";
import { ensureUniqueCatalogIds } from "./company-catalog";

let cachedVerifiedCatalog: CompanyJobSource[] | null = null;

/** Bundled verified catalog — static import only, never read from disk at runtime. */
export function loadBundledVerifiedCatalog(): CompanyJobSource[] {
  if (!cachedVerifiedCatalog) {
    const seed = companySourcesSeedSchema.parse(verifiedCatalog);
    const verified = seed.companies.filter(
      (c) => c.enabled && c.verificationStatus === "verified"
    );
    cachedVerifiedCatalog = ensureUniqueCatalogIds(verified);
  }
  return cachedVerifiedCatalog;
}
