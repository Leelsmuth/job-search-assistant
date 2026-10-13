import { eq } from "drizzle-orm";
import { searchPreferences } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import {
  defaultSearchPreferences,
  searchPreferencesFromRow,
  type SearchPreferences,
} from "@/modules/matching/search-preferences";

export async function loadSearchPreferences(db: Db, userId: string): Promise<SearchPreferences> {
  const table = (
    db.query as {
      searchPreferences?: {
        findFirst: (args: unknown) => Promise<Parameters<typeof searchPreferencesFromRow>[0] | undefined>;
      };
    }
  ).searchPreferences;

  if (!table) return defaultSearchPreferences();

  const row = await table.findFirst({
    where: eq(searchPreferences.userId, userId),
  });
  return row ? searchPreferencesFromRow(row) : defaultSearchPreferences();
}
