import { readFileSync } from "fs";
import { join } from "path";
import {
  companySourcesSeedSchema,
  type CompanyJobSource,
} from "../../../data/company-sources.schema";

let cachedSeed: CompanyJobSource[] | null = null;

function loadSeedFile() {
  const path = join(process.cwd(), "data/company-sources.seed.json");
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const seed = companySourcesSeedSchema.parse(raw);
  return seed.companies.filter((c) => c.enabled);
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
    tag?: string;
    search?: string;
  }
): CompanyJobSource[] {
  let result = entries;
  if (filters?.provider) {
    result = result.filter((c) => c.atsProvider === filters.provider);
  }
  if (filters?.country) {
    result = result.filter((c) => c.country === filters.country);
  }
  if (filters?.tag) {
    result = result.filter((c) => c.tags.includes(filters.tag!));
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }
  return result;
}
