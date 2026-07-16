import type { CompanyJobSource } from "../../../data/company-sources.schema";
import { makeRegistryId } from "./registry/board-identity";

/** When Ashby/Lever boards share a slug with a Greenhouse board, legacy seeds reused the bare slug as id. */
export function ensureUniqueCatalogIds(
  companies: CompanyJobSource[]
): CompanyJobSource[] {
  const byId = new Map<string, CompanyJobSource[]>();
  for (const company of companies) {
    const group = byId.get(company.id) ?? [];
    group.push(company);
    byId.set(company.id, group);
  }

  return companies.map((company) => {
    const group = byId.get(company.id)!;
    if (group.length === 1 || company.atsProvider === "greenhouse") {
      return company;
    }
    return {
      ...company,
      id: makeRegistryId(company.atsProvider, company.boardSlug),
    };
  });
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
