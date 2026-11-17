/**
 * The signed-in compare tray and priorities, kept on the user's
 * search_preferences row (migration 0025), and the roles behind the tray.
 *
 * Every function takes a user-scoped transaction (withUserDb), so row level
 * security applies on top of the explicit user_id checks here.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { jobs, matchAnalyses, searchPreferences } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { MATCH_CLASSIFICATIONS, type MatchClassification } from "@/lib/utils";
import { statusLabel } from "@/modules/applications/tracker";
import { isLocationClass } from "@/modules/location/eligibility";
import { mapRowToJobListItem } from "@/modules/jobs/job-list-item";
import {
  enrichJobListItem,
  loadFeedEnrichmentContext,
} from "@/modules/jobs/jobs-feed-service";
import {
  defaultSearchPreferences,
  type SearchPreferences,
} from "@/modules/matching/search-preferences";
import { isMissingSearchPreferenceColumn } from "@/modules/matching/load-search-preferences";
import { locationBlocker, type CompareRole } from "@/modules/compare/role";
import {
  SUGGESTED_PRIORITY_ORDER,
  parsePriorityOrder,
  type PriorityId,
} from "@/modules/compare/priorities";
import {
  EMPTY_COMPARE_SLOTS,
  filledIds,
  parseCompareSlots,
  type CompareSlots,
} from "@/modules/compare/slots";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Job ids are uuids; anything else is dropped before it reaches a query. */
export function isJobId(value: string): boolean {
  return UUID.test(value);
}

export type AccountCompareState = {
  slots: CompareSlots;
  /** The jobs in the tray, in slot order. */
  roles: CompareRole[];
  priorities: {
    order: PriorityId[];
    /** False until the user changes the suggested order. */
    saved: boolean;
  };
  /**
   * False when migration 0025 has not been applied yet. The tray and the
   * ranking still work for the page, but nothing can be saved.
   */
  available: boolean;
};

export class CompareStorageUnavailableError extends Error {
  constructor() {
    super(
      "Comparing is not set up on this database yet. Apply drizzle/migrations/0025_compare_tray.sql."
    );
    this.name = "CompareStorageUnavailableError";
  }
}

function isMissingCompareColumn(error: unknown): boolean {
  return (
    isMissingSearchPreferenceColumn(error, "compare_slots") ||
    isMissingSearchPreferenceColumn(error, "compare_priorities")
  );
}

/** The tray, the roles in it, and the ranking, as the feed page starts with them. */
export async function loadCompareState(db: Db, userId: string): Promise<AccountCompareState> {
  let row: { compareSlots: unknown; comparePriorities: unknown } | undefined;
  try {
    row = await db.query.searchPreferences.findFirst({
      where: eq(searchPreferences.userId, userId),
      columns: { compareSlots: true, comparePriorities: true },
    });
  } catch (error) {
    if (!isMissingCompareColumn(error)) throw error;
    return {
      slots: EMPTY_COMPARE_SLOTS,
      roles: [],
      priorities: { order: [...SUGGESTED_PRIORITY_ORDER], saved: false },
      available: false,
    };
  }

  const stored = parseCompareSlots(row?.compareSlots, isJobId);
  const roles = await loadCompareRoles(db, userId, filledIds(stored));
  return {
    // A job deleted since it was added drops out; the next save stores that.
    slots: keepKnown(stored, roles),
    roles,
    priorities:
      row?.comparePriorities == null
        ? { order: [...SUGGESTED_PRIORITY_ORDER], saved: false }
        : { order: parsePriorityOrder(row.comparePriorities), saved: true },
    available: true,
  };
}

function keepKnown(slots: CompareSlots, roles: readonly CompareRole[]): CompareSlots {
  const known = new Set(roles.map((role) => role.id));
  return slots.map((id) => (id !== null && known.has(id) ? id : null));
}

/**
 * Save the tray. Only the user's own jobs are kept; anything else becomes an
 * empty slot. Returns what was saved and the roles in it.
 */
export async function saveCompareSlots(
  db: Db,
  userId: string,
  input: unknown
): Promise<{ slots: CompareSlots; roles: CompareRole[] }> {
  const requested = parseCompareSlots(input, isJobId);
  const roles = await loadCompareRoles(db, userId, filledIds(requested));
  const slots = keepKnown(requested, roles);
  await upsertCompareColumns(db, userId, { compareSlots: [...slots] });
  return { slots, roles };
}

/** Save the ranking. Returns the order as saved (unknown entries dropped, missing ones appended). */
export async function saveComparePriorities(
  db: Db,
  userId: string,
  input: unknown
): Promise<PriorityId[]> {
  const order = parsePriorityOrder(input);
  await upsertCompareColumns(db, userId, { comparePriorities: order });
  return order;
}

/**
 * Write the compare columns only. A user without a preferences row gets one
 * with the app's defaults, like the other single-setting saves, rather than
 * the column defaults (which differ, e.g. discover_curated_boards). updated_at
 * is left alone: it marks search setting changes, and the tray is not one.
 */
async function upsertCompareColumns(
  db: Db,
  userId: string,
  values: { compareSlots?: (string | null)[]; comparePriorities?: string[] }
) {
  try {
    await db
      .insert(searchPreferences)
      .values({ userId, ...defaultSearchPreferences(), ...values })
      .onConflictDoUpdate({ target: searchPreferences.userId, set: values });
  } catch (error) {
    if (isMissingCompareColumn(error)) throw new CompareStorageUnavailableError();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

function asClassification(value: string | null | undefined): MatchClassification | null {
  return value && (MATCH_CLASSIFICATIONS as readonly string[]).includes(value)
    ? (value as MatchClassification)
    : null;
}

function trackerStatus(
  application: { status: string } | undefined,
  job: { isSaved: boolean; status: string | null }
): string {
  const text = application ? statusLabel(application.status) : job.isSaved ? "Saved" : "Not saved";
  return job.status === "dismissed" ? `${text} (dismissed)` : text;
}

function nonEmpty(values: readonly string[] | null | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

/**
 * The user's jobs with these ids, as the comparison sees them, in the order
 * given. Ids that are not the user's jobs are skipped. Fit, location class,
 * and resume score come from the same code as the feed (enrichJobListItem),
 * so a job shows the same numbers in both.
 */
export async function loadCompareRoles(
  db: Db,
  userId: string,
  ids: readonly string[],
  preferences?: SearchPreferences
): Promise<CompareRole[]> {
  const wanted = ids.filter(isJobId);
  if (wanted.length === 0) return [];

  const rows = await db.query.jobs.findMany({
    where: and(eq(jobs.userId, userId), inArray(jobs.id, wanted)),
    columns: {
      id: true,
      title: true,
      jobUrl: true,
      location: true,
      workplaceType: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      technologies: true,
      requiredQualifications: true,
      preferredQualifications: true,
      locationEligibility: true,
      locationFlags: true,
      description: true,
      fitScore: true,
      fitEligible: true,
      fitIneligibleReason: true,
      frontendFitScore: true,
      frontendFitReasons: true,
      isSaved: true,
      status: true,
      dateDiscovered: true,
      postedAt: true,
      postedAtSource: true,
    },
    with: {
      company: { columns: { name: true } },
      source: { columns: { provider: true } },
      requirements: {
        columns: { id: true, requirementType: true, normalizedSkill: true, text: true },
      },
      matchAnalyses: {
        orderBy: [desc(matchAnalyses.createdAt)],
        limit: 1,
        columns: {
          overallScore: true,
          classification: true,
          topConcern: true,
          topMatchingSkills: true,
          createdAt: true,
        },
      },
      applications: { columns: { status: true, userId: true } },
    },
  });
  if (rows.length === 0) return [];

  const context = await loadFeedEnrichmentContext(db, userId, preferences);
  const optIns = {
    includeHybridGta: context.preferences.includeHybridGta,
    includeOnsiteGta: context.preferences.includeOnsiteGta,
  };

  const byId = new Map(
    rows.map((row) => {
      const item = enrichJobListItem(mapRowToJobListItem(row), row.description, context);
      const locationClass = isLocationClass(item.locationClass) ? item.locationClass : null;
      // Requirements: the extracted qualification lists, else the parsed requirement rows.
      const required = nonEmpty(row.requiredQualifications);
      const requirements =
        required.length > 0
          ? required
          : nonEmpty(
              row.requirements
                .filter((requirement) => requirement.requirementType !== "responsibility")
                .map((requirement) => requirement.text)
            );
      const application = row.applications.find((candidate) => candidate.userId === userId);
      const postedAt = row.postedAt ?? row.dateDiscovered;

      const role: CompareRole = {
        id: row.id,
        title: row.title,
        company: row.company?.name ?? "Unknown company",
        href: `/jobs/${row.id}`,
        fitScore: item.frontendFit?.score ?? null,
        classification: asClassification(item.match?.classification),
        salaryMin: row.salaryMin,
        salaryMax: row.salaryMax,
        salaryCurrency: row.salaryCurrency ?? "CAD",
        location: row.location,
        workplaceType: row.workplaceType,
        locationClass,
        locationFlags: item.locationFlags,
        locationBlocker: locationBlocker(locationClass, item.locationFlags, optIns),
        postedAt: postedAt.toISOString(),
        postedAtSource: row.postedAt && row.postedAtSource === "provider" ? "provider" : "first_seen",
        fitReasons: item.frontendFit?.reasons ?? [],
        topConcern: item.match?.topConcern ?? null,
        matchingSkills: item.match?.topMatchingSkills ?? [],
        requirements,
        niceToHave: nonEmpty(row.preferredQualifications),
        technologies: nonEmpty(row.technologies),
        trackerStatus: trackerStatus(application, row),
        resumeScore: item.resumeScore,
      };
      return [row.id, role] as const;
    })
  );

  return wanted.map((id) => byId.get(id)).filter((role): role is CompareRole => role !== undefined);
}
