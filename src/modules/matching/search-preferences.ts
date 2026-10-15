import { canonicalBoardUrl } from "@/modules/discovery/curated-boards";
import { DEFAULT_GTA_CITIES, type LocationVisibility } from "@/modules/location/eligibility";
import { normalizeSeniority, type SeniorityLevel } from "@/modules/matching/frontend-fit";

export const DEFAULT_TARGET_TITLES = [
  "Frontend Engineer",
  "UI Engineer",
  "React Developer",
  "TypeScript Developer",
  "Full-Stack Engineer",
  "Design Engineer",
  "Web Platform Engineer",
];

export type SearchPreferences = LocationVisibility & {
  targetTitles: string[];
  preferredSeniority: SeniorityLevel;
  minimumSalaryCad: number | null;
  discoverCuratedBoards: boolean;
  excludedCuratedBoardUrls: string[];
  gtaCities: string[];
};

export type SearchPreferenceInput = {
  targetTitles?: string[] | string;
  preferredSeniority?: string | null;
  minimumSalaryCad?: number | null;
  includeHybridGta?: boolean;
  includeOnsiteGta?: boolean;
  showRemoteOther?: boolean;
  showOutOfArea?: boolean;
  discoverCuratedBoards?: boolean;
  excludedCuratedBoardUrls?: string[] | string;
  gtaCities?: string[] | string;
};

export function defaultSearchPreferences(): SearchPreferences {
  return {
    targetTitles: [...DEFAULT_TARGET_TITLES],
    preferredSeniority: "senior",
    minimumSalaryCad: null,
    includeHybridGta: true,
    includeOnsiteGta: true,
    showRemoteOther: false,
    showOutOfArea: false,
    discoverCuratedBoards: true,
    excludedCuratedBoardUrls: [],
    gtaCities: [...DEFAULT_GTA_CITIES],
  };
}

export function normalizeExcludedCuratedBoardUrls(value: string[] | string | undefined): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [];
  const cleaned = source
    .filter((item): item is string => typeof item === "string")
    .map((item) => canonicalBoardUrl(item))
    .filter((item) => item.length > 0);
  return [...new Set(cleaned)].slice(0, 200);
}

function splitList(value: string[] | string | undefined, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : fallback;
  const cleaned = source.map((item) => item.trim()).filter((item) => item.length > 0);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function normalizeSearchPreferences(input: SearchPreferenceInput = {}): SearchPreferences {
  const defaults = defaultSearchPreferences();
  const minimum = input.minimumSalaryCad;
  const salary =
    minimum == null || Number.isNaN(minimum) ? null : Math.max(0, Math.round(minimum));

  return {
    targetTitles: splitList(input.targetTitles, defaults.targetTitles).slice(0, 12),
    preferredSeniority: normalizeSeniority(input.preferredSeniority ?? defaults.preferredSeniority),
    minimumSalaryCad: salary != null && salary > 2_000_000 ? 2_000_000 : salary,
    includeHybridGta: input.includeHybridGta ?? defaults.includeHybridGta,
    includeOnsiteGta: input.includeOnsiteGta ?? defaults.includeOnsiteGta,
    showRemoteOther: input.showRemoteOther ?? defaults.showRemoteOther,
    showOutOfArea: input.showOutOfArea ?? defaults.showOutOfArea,
    discoverCuratedBoards: input.discoverCuratedBoards ?? defaults.discoverCuratedBoards,
    excludedCuratedBoardUrls: normalizeExcludedCuratedBoardUrls(input.excludedCuratedBoardUrls),
    gtaCities: splitList(input.gtaCities, defaults.gtaCities).slice(0, 40),
  };
}

export type SearchPreferenceRow = {
  targetTitles: unknown;
  preferredSeniority: string;
  minimumSalaryCad: number | null;
  includeHybridGta: boolean;
  includeOnsiteGta: boolean;
  showRemoteOther: boolean;
  showOutOfArea: boolean;
  discoverCuratedBoards: boolean;
  excludedCuratedBoardUrls?: unknown;
  gtaCities: unknown;
};

export function searchPreferencesFromRow(row: SearchPreferenceRow): SearchPreferences {
  return normalizeSearchPreferences({
    targetTitles: Array.isArray(row.targetTitles) ? (row.targetTitles as string[]) : undefined,
    preferredSeniority: row.preferredSeniority,
    minimumSalaryCad: row.minimumSalaryCad,
    includeHybridGta: row.includeHybridGta,
    includeOnsiteGta: row.includeOnsiteGta,
    showRemoteOther: row.showRemoteOther,
    showOutOfArea: row.showOutOfArea,
    discoverCuratedBoards: row.discoverCuratedBoards,
    excludedCuratedBoardUrls: Array.isArray(row.excludedCuratedBoardUrls)
      ? (row.excludedCuratedBoardUrls as string[])
      : undefined,
    gtaCities: Array.isArray(row.gtaCities) ? (row.gtaCities as string[]) : undefined,
  });
}
