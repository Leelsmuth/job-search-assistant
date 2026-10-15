"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { searchPreferences } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import { getUser } from "@/lib/supabase/server";
import { kickDiscoverBatch } from "@/lib/cron-discover-kick";
import {
  canonicalBoardUrl,
  isCuratedBoardUrl,
} from "@/modules/discovery/curated-boards";
import { isMissingSearchPreferenceColumn } from "@/modules/matching/load-search-preferences";
import {
  defaultSearchPreferences,
  normalizeExcludedCuratedBoardUrls,
} from "@/modules/matching/search-preferences";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

const EXCLUSIONS_SCHEMA_MESSAGE =
  "Apply drizzle/migrations/0017_curated_board_discovery.sql in the Supabase SQL editor before excluding curated boards.";

function preferenceDefaults(userId: string, discoverCuratedBoards: boolean) {
  const prefs = defaultSearchPreferences();
  return {
    userId,
    targetTitles: prefs.targetTitles,
    preferredSeniority: prefs.preferredSeniority,
    minimumSalaryCad: prefs.minimumSalaryCad,
    includeHybridGta: prefs.includeHybridGta,
    includeOnsiteGta: prefs.includeOnsiteGta,
    showRemoteOther: prefs.showRemoteOther,
    showOutOfArea: prefs.showOutOfArea,
    discoverCuratedBoards,
    gtaCities: prefs.gtaCities,
    updatedAt: new Date(),
  };
}

export async function setIncludeCuratedBoards(include: boolean): Promise<void> {
  if (typeof include !== "boolean") throw new Error("Invalid curated board setting");
  const user = await requireUser();
  await withUserDb(user.id, async (db) => {
    const existing = await db.query.searchPreferences.findFirst({
      where: eq(searchPreferences.userId, user.id),
      columns: { userId: true },
    });
    if (existing) {
      await db
        .update(searchPreferences)
        .set({ discoverCuratedBoards: include, updatedAt: new Date() })
        .where(eq(searchPreferences.userId, user.id));
      return;
    }
    await db.insert(searchPreferences).values(preferenceDefaults(user.id, include));
  });
  revalidatePath("/discovery");
  revalidatePath("/settings");
}

export async function setCuratedBoardExcluded(boardUrl: string, excluded: boolean): Promise<void> {
  if (typeof excluded !== "boolean") throw new Error("Invalid exclusion");
  if (!isCuratedBoardUrl(boardUrl)) throw new Error("Unknown curated board");
  const key = canonicalBoardUrl(boardUrl);
  const user = await requireUser();

  try {
    await withUserDb(user.id, async (db) => {
      const existing = await db.query.searchPreferences.findFirst({
        where: eq(searchPreferences.userId, user.id),
        columns: { excludedCuratedBoardUrls: true },
      });
      const current = normalizeExcludedCuratedBoardUrls(existing?.excludedCuratedBoardUrls ?? []);
      const next = new Set(current);
      if (excluded) next.add(key);
      else next.delete(key);
      const excludedCuratedBoardUrls = [...next];

      if (existing) {
        await db
          .update(searchPreferences)
          .set({ excludedCuratedBoardUrls, updatedAt: new Date() })
          .where(eq(searchPreferences.userId, user.id));
        return;
      }

      await db.insert(searchPreferences).values({
        ...preferenceDefaults(user.id, true),
        excludedCuratedBoardUrls,
      });
    });
  } catch (error) {
    if (isMissingSearchPreferenceColumn(error, "excluded_curated_board_urls")) {
      throw new Error(EXCLUSIONS_SCHEMA_MESSAGE);
    }
    throw error;
  }

  revalidatePath("/discovery");
  revalidatePath("/settings");
}

export async function runDiscoveryNow(): Promise<{ ok: true }> {
  await requireUser();
  await kickDiscoverBatch({
    cursor: 0,
    hop: 0,
    runStartedAt: new Date().toISOString(),
  });
  return { ok: true };
}
