import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  companySourcesSeedSchema,
  type CompanyJobSource,
} from "../../../data/company-sources.schema";

let cachedSeed: CompanyJobSource[] | null = null;

function loadSeedFile() {
  const verifiedPath = join(process.cwd(), "data/company-sources.verified.json");
  const seedPath = join(process.cwd(), "data/company-sources.seed.json");
  const path = existsSync(verifiedPath) ? verifiedPath : seedPath;
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const seed = companySourcesSeedSchema.parse(raw);
  return seed.companies.filter(
    (c) => c.enabled && c.verificationStatus === "verified"
  );
}

export function getCompanySourceCatalog(): CompanyJobSource[] {
  if (!cachedSeed) {
    cachedSeed = loadSeedFile();
  }
  return cachedSeed;
}

export function getCatalogEntryById(id: string): CompanyJobSource | undefined {
  return getCompanySourceCatalog().find((c) => c.id === id);
}

export function filterCatalog(
  entries: CompanyJobSource[],
  filters?: {
    provider?: string;
    country?: string;
    industry?: string;
    signal?: string;
    search?: string;
  }
): CompanyJobSource[] {
  let result = entries;
  if (filters?.provider) {
    result = result.filter((c) => c.atsProvider === filters.provider);
  }
  if (filters?.country) {
    result = result.filter((c) => c.headquartersCountry === filters.country);
  }
  if (filters?.industry) {
    result = result.filter((c) => c.industries.includes(filters.industry!));
  }
  if (filters?.signal) {
    result = result.filter((c) => {
      const signals = c.observedSignals;
      if (!signals) return false;
      return signals[filters.signal as keyof typeof signals] === true;
    });
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.boardSlug.toLowerCase().includes(q)
    );
  }
  return result;
}
