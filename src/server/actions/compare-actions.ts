"use server";

import { withUserDb } from "@/db/user-context";
import { getUser } from "@/lib/supabase/server";
import {
  CompareStorageUnavailableError,
  loadCompareState,
  saveComparePriorities as saveComparePrioritiesDb,
  saveCompareSlots,
  type AccountCompareState,
} from "@/modules/compare/compare-db";
import type { PriorityId } from "@/modules/compare/priorities";
import type { CompareRole } from "@/modules/compare/role";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/**
 * Why a save did not happen. Returned rather than thrown: Next.js hides the
 * message of errors thrown from server actions in production, and the tray
 * words these two differently.
 */
export type CompareSaveFailure = {
  ok: false;
  /** "unavailable": migration 0025 is not applied. "failed": anything else, worth retrying. */
  reason: "unavailable" | "failed";
};

export type CompareTrayResult =
  | { ok: true; slots: (string | null)[]; roles: CompareRole[] }
  | CompareSaveFailure;

export type ComparePrioritiesResult = { ok: true; order: PriorityId[] } | CompareSaveFailure;

function failure(error: unknown, what: string): CompareSaveFailure {
  if (error instanceof CompareStorageUnavailableError) return { ok: false, reason: "unavailable" };
  console.error(`[compare] could not save ${what}`, error);
  return { ok: false, reason: "failed" };
}

/** The tray, the roles in it, and the ranking, for the job feed page. */
export async function getCompareState(): Promise<AccountCompareState> {
  const user = await requireUser();
  return withUserDb(user.id, (db) => loadCompareState(db, user.id));
}

/**
 * Save the tray, slot by slot (a job id or null). Only the user's own jobs
 * are kept. Returns what was saved, with the roles behind it.
 */
export async function saveCompareTray(slots: unknown): Promise<CompareTrayResult> {
  const user = await requireUser();
  try {
    const saved = await withUserDb(user.id, (db) => saveCompareSlots(db, user.id, slots));
    return { ok: true, slots: [...saved.slots], roles: saved.roles };
  } catch (error) {
    return failure(error, "the compare tray");
  }
}

/** Save the ranked priorities, most important first. */
export async function saveComparePriorities(order: unknown): Promise<ComparePrioritiesResult> {
  const user = await requireUser();
  try {
    const saved = await withUserDb(user.id, (db) => saveComparePrioritiesDb(db, user.id, order));
    return { ok: true, order: saved };
  } catch (error) {
    return failure(error, "compare priorities");
  }
}
