import { eq } from "drizzle-orm";
import { searchPreferences } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import {
  defaultSearchPreferences,
  searchPreferencesFromRow,
  type SearchPreferenceRow,
  type SearchPreferences,
} from "@/modules/matching/search-preferences";

const PREFERENCE_COLUMNS = {
  targetTitles: true,
  preferredSeniority: true,
  minimumSalaryCad: true,
  minFitToShow: true,
  digestMinFit: true,
  includeHybridGta: true,
  includeOnsiteGta: true,
  showRemoteOther: true,
  showOutOfArea: true,
  discoverCuratedBoards: true,
  gtaCities: true,
} as const;

const PREFERENCE_COLUMNS_WITHOUT_THRESHOLDS = {
  targetTitles: true,
  preferredSeniority: true,
  minimumSalaryCad: true,
  includeHybridGta: true,
  includeOnsiteGta: true,
  showRemoteOther: true,
  showOutOfArea: true,
  discoverCuratedBoards: true,
  gtaCities: true,
} as const;

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current instanceof Error) parts.push(current.message);
    if (typeof current === "object") {
      const record = current as { code?: unknown; message?: unknown; cause?: unknown };
      if (typeof record.code === "string") parts.push(record.code);
      if (typeof record.message === "string") parts.push(record.message);
      current = record.cause;
    } else {
      break;
    }
  }
  return parts.join("\n");
}

export function isMissingSearchPreferenceColumn(error: unknown, column: string): boolean {
  const text = errorText(error);
  return text.includes(column) && /does not exist|42703/i.test(text);
}

export function isMissingDatabaseRelation(error: unknown, relation: string): boolean {
  const text = errorText(error);
  return text.includes(relation) && /does not exist|42P01/i.test(text);
}

type PreferenceQuery = {
  findFirst: (args: unknown) => Promise<SearchPreferenceRow | undefined>;
};

export async function loadSearchPreferences(db: Db, userId: string): Promise<SearchPreferences> {
  const table = (db.query as { searchPreferences?: PreferenceQuery }).searchPreferences;
  if (!table) return defaultSearchPreferences();

  try {
    const row = await table.findFirst({
      where: eq(searchPreferences.userId, userId),
      columns: {
        ...PREFERENCE_COLUMNS,
        excludedCuratedBoardUrls: true,
        enabledDiscoverySources: true,
      },
    });
    return row ? searchPreferencesFromRow(row) : defaultSearchPreferences();
  } catch (error) {
    if (isMissingSearchPreferenceColumn(error, "enabled_discovery_sources")) {
      try {
        const row = await table.findFirst({
          where: eq(searchPreferences.userId, userId),
          columns: { ...PREFERENCE_COLUMNS, excludedCuratedBoardUrls: true },
        });
        return row ? searchPreferencesFromRow(row) : defaultSearchPreferences();
      } catch (inner) {
        if (!isMissingSearchPreferenceColumn(inner, "excluded_curated_board_urls")) throw inner;
        const row = await table.findFirst({
          where: eq(searchPreferences.userId, userId),
          columns: PREFERENCE_COLUMNS,
        });
        return row ? searchPreferencesFromRow(row) : defaultSearchPreferences();
      }
    }
    if (isMissingSearchPreferenceColumn(error, "excluded_curated_board_urls")) {
      const row = await table.findFirst({
        where: eq(searchPreferences.userId, userId),
        columns: PREFERENCE_COLUMNS,
      });
      return row ? searchPreferencesFromRow(row) : defaultSearchPreferences();
    }
    if (
      isMissingSearchPreferenceColumn(error, "min_fit_to_show") ||
      isMissingSearchPreferenceColumn(error, "digest_min_fit")
    ) {
      const row = await table.findFirst({
        where: eq(searchPreferences.userId, userId),
        columns: { ...PREFERENCE_COLUMNS_WITHOUT_THRESHOLDS, excludedCuratedBoardUrls: true },
      });
      return row ? searchPreferencesFromRow(row) : defaultSearchPreferences();
    }
    throw error;
  }
}
