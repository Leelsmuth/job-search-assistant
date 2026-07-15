import type { CompanyJobSource } from "../../../../data/company-sources.schema";
import type { DiscoveredCompanyCandidate } from "./discovery-sources/types";
import {
  boardIdentityKey,
  formatCompanyNameFromSlug,
  makeRegistryId,
  slugifyCompanyName,
} from "./board-identity";
import { boardUrlForProvider } from "./board-url";

const JUNK_SLUG_PATTERNS = [
  /^\d+$/,
  /^[0-9a-f]{8,}$/i,
  /intern|test|demo|sandbox|example/i,
  /^[a-z]{1,2}$/,
];

export function isPlausibleBoardSlug(slug: string): boolean {
  const trimmed = slug.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (JUNK_SLUG_PATTERNS.some((p) => p.test(trimmed))) return false;
  return /^[a-z0-9][a-z0-9._-]*$/i.test(trimmed);
}

export function candidateToRegistryEntry(
  candidate: DiscoveredCompanyCandidate,
  existing?: Partial<CompanyJobSource>
): CompanyJobSource {
  const boardSlug = candidate.boardSlug.trim();
  const boardUrl = candidate.boardUrl ?? boardUrlForProvider(candidate.atsProvider, boardSlug);
  const companyName =
    candidate.companyName?.trim() ||
    existing?.companyName ||
    formatCompanyNameFromSlug(boardSlug);

  const industries = (candidate.industries ?? existing?.industries ?? []).filter(
    (tag) => !["remote-canada", "frontend-heavy", "remote-friendly"].includes(tag)
  );

  return {
    id: existing?.id ?? makeRegistryId(candidate.atsProvider, boardSlug),
    companyName,
    companySlug: slugifyCompanyName(companyName),
    atsProvider: candidate.atsProvider,
    boardSlug,
    boardUrl,
    companyWebsite: candidate.companyWebsite ?? existing?.companyWebsite,
    careersUrl: candidate.careersUrl ?? existing?.careersUrl,
    headquartersCountry: candidate.headquartersCountry ?? existing?.headquartersCountry,
    companyCountries: existing?.companyCountries,
    industries,
    enabled: existing?.enabled ?? true,
    verificationStatus: existing?.verificationStatus ?? "verification_failed",
    verifiedAt: existing?.verifiedAt,
    lastJobCount: existing?.lastJobCount,
    verificationError: existing?.verificationError,
    observedSignals: existing?.observedSignals,
    discoverySource: candidate.discoverySource ?? existing?.discoverySource,
    lastSyncedAt: existing?.lastSyncedAt,
  };
}

export function dedupeCandidates(
  candidates: DiscoveredCompanyCandidate[]
): DiscoveredCompanyCandidate[] {
  const seen = new Set<string>();
  const result: DiscoveredCompanyCandidate[] = [];

  for (const candidate of candidates) {
    if (!isPlausibleBoardSlug(candidate.boardSlug)) continue;
    const key = boardIdentityKey({
      provider: candidate.atsProvider,
      boardSlug: candidate.boardSlug,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

export function mergeRegistryEntries(
  existing: CompanyJobSource[],
  candidates: DiscoveredCompanyCandidate[]
): CompanyJobSource[] {
  const byBoard = new Map<string, CompanyJobSource>();
  for (const entry of existing) {
    byBoard.set(
      boardIdentityKey({ provider: entry.atsProvider, boardSlug: entry.boardSlug }),
      entry
    );
  }

  for (const candidate of dedupeCandidates(candidates)) {
    const key = boardIdentityKey({
      provider: candidate.atsProvider,
      boardSlug: candidate.boardSlug,
    });
    const prev = byBoard.get(key);
    byBoard.set(key, candidateToRegistryEntry(candidate, prev));
  }

  return Array.from(byBoard.values()).sort((a, b) =>
    a.companyName.localeCompare(b.companyName)
  );
}

export type RegistryAuditReport = {
  total: number;
  byProvider: Record<string, number>;
  byVerificationStatus: Record<string, number>;
  boardDuplicates: Array<{ key: string; ids: string[] }>;
  companyNameDuplicates: Array<{ name: string; entries: Array<{ id: string; provider: string; slug: string }> }>;
  suspiciousIndustries: Array<{ id: string; industries: string[] }>;
  legacyTagsFound: number;
};

export function auditRegistry(companies: CompanyJobSource[]): RegistryAuditReport {
  const byProvider: Record<string, number> = {};
  const byVerificationStatus: Record<string, number> = {};

  const boardMap = new Map<string, string[]>();
  const nameMap = new Map<string, Array<{ id: string; provider: string; slug: string }>>();

  let legacyTagsFound = 0;
  const suspiciousIndustries: RegistryAuditReport["suspiciousIndustries"] = [];

  for (const c of companies) {
    byProvider[c.atsProvider] = (byProvider[c.atsProvider] ?? 0) + 1;
    byVerificationStatus[c.verificationStatus] =
      (byVerificationStatus[c.verificationStatus] ?? 0) + 1;

    const boardKey = boardIdentityKey({ provider: c.atsProvider, boardSlug: c.boardSlug });
    const ids = boardMap.get(boardKey) ?? [];
    ids.push(c.id);
    boardMap.set(boardKey, ids);

    const nameKey = c.companyName.toLowerCase().trim();
    const entries = nameMap.get(nameKey) ?? [];
    entries.push({ id: c.id, provider: c.atsProvider, slug: c.boardSlug });
    nameMap.set(nameKey, entries);

    const badTags = c.industries.filter((t) =>
      ["remote-canada", "frontend-heavy", "remote-friendly"].includes(t)
    );
    if (badTags.length > 0) {
      legacyTagsFound++;
      suspiciousIndustries.push({ id: c.id, industries: badTags });
    }
  }

  const boardDuplicates = [...boardMap.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids }));

  const companyNameDuplicates = [...nameMap.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([name, entries]) => ({ name, entries }));

  return {
    total: companies.length,
    byProvider,
    byVerificationStatus,
    boardDuplicates,
    companyNameDuplicates,
    suspiciousIndustries,
    legacyTagsFound,
  };
}
