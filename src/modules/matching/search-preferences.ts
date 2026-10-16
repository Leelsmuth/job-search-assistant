import { canonicalBoardUrl } from "@/modules/discovery/curated-boards";
import {
  normalizeEnabledDiscoverySources,
  type DiscoverySourceId,
} from "@/modules/discovery/source-catalog";
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

export const DEFAULT_MIN_FIT_TO_SHOW = 50;
export const DEFAULT_DIGEST_MIN_FIT = 55;

export type SearchPreferences = LocationVisibility & {
  targetTitles: string[];
  preferredSeniority: SeniorityLevel;
  minimumSalaryCad: number | null;
  minFitToShow: number;
  digestMinFit: number;
  discoverCuratedBoards: boolean;
  excludedCuratedBoardUrls: string[];
  enabledDiscoverySources: Record<DiscoverySourceId, boolean>;
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
  minFitToShow?: number | null;
  digestMinFit?: number | null;
  discoverCuratedBoards?: boolean;
  excludedCuratedBoardUrls?: string[] | string;
  enabledDiscoverySources?: unknown;
  gtaCities?: string[] | string;
};

export function defaultSearchPreferences(): SearchPreferences {
  return {
    targetTitles: [...DEFAULT_TARGET_TITLES],
    preferredSeniority: "senior",
    minimumSalaryCad: null,
    minFitToShow: DEFAULT_MIN_FIT_TO_SHOW,
    digestMinFit: DEFAULT_DIGEST_MIN_FIT,
    includeHybridGta: true,
    includeOnsiteGta: true,
    showRemoteOther: false,
    showOutOfArea: false,
    discoverCuratedBoards: true,
    excludedCuratedBoardUrls: [],
    enabledDiscoverySources: normalizeEnabledDiscoverySources(undefined),
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

function clampFitThreshold(value: number | null | undefined, fallback: number): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
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
    minFitToShow: clampFitThreshold(input.minFitToShow, defaults.minFitToShow),
    digestMinFit: clampFitThreshold(input.digestMinFit, defaults.digestMinFit),
    includeHybridGta: input.includeHybridGta ?? defaults.includeHybridGta,
    includeOnsiteGta: input.includeOnsiteGta ?? defaults.includeOnsiteGta,
    showRemoteOther: input.showRemoteOther ?? defaults.showRemoteOther,
    showOutOfArea: input.showOutOfArea ?? defaults.showOutOfArea,
    discoverCuratedBoards: input.discoverCuratedBoards ?? defaults.discoverCuratedBoards,
    excludedCuratedBoardUrls: normalizeExcludedCuratedBoardUrls(input.excludedCuratedBoardUrls),
    enabledDiscoverySources:
      input.enabledDiscoverySources === undefined
        ? defaults.enabledDiscoverySources
        : normalizeEnabledDiscoverySources(input.enabledDiscoverySources),
    gtaCities: splitList(input.gtaCities, defaults.gtaCities).slice(0, 40),
  };
}

export type SearchPreferenceRow = {
  targetTitles: unknown;
  preferredSeniority: string;
  minimumSalaryCad: number | null;
  minFitToShow?: number | null;
  digestMinFit?: number | null;
  includeHybridGta: boolean;
  includeOnsiteGta: boolean;
  showRemoteOther: boolean;
  showOutOfArea: boolean;
  discoverCuratedBoards: boolean;
  excludedCuratedBoardUrls?: unknown;
  enabledDiscoverySources?: unknown;
  gtaCities: unknown;
};

export function searchPreferencesFromRow(row: SearchPreferenceRow): SearchPreferences {
  return normalizeSearchPreferences({
    targetTitles: Array.isArray(row.targetTitles) ? (row.targetTitles as string[]) : undefined,
    preferredSeniority: row.preferredSeniority,
    minimumSalaryCad: row.minimumSalaryCad,
    minFitToShow: row.minFitToShow,
    digestMinFit: row.digestMinFit,
    includeHybridGta: row.includeHybridGta,
    includeOnsiteGta: row.includeOnsiteGta,
    showRemoteOther: row.showRemoteOther,
    showOutOfArea: row.showOutOfArea,
    discoverCuratedBoards: row.discoverCuratedBoards,
    excludedCuratedBoardUrls: Array.isArray(row.excludedCuratedBoardUrls)
      ? (row.excludedCuratedBoardUrls as string[])
      : undefined,
    enabledDiscoverySources: row.enabledDiscoverySources,
    gtaCities: Array.isArray(row.gtaCities) ? (row.gtaCities as string[]) : undefined,
  });
}
