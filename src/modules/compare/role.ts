/**
 * A role as the compare tray and the comparison see it. The demo builds these
 * from its sample jobs; the signed-in app builds them from the user's jobs
 * (src/modules/compare/compare-db.ts). Plain data only, so it can cross from
 * a server action to the browser.
 */
import type { MatchClassification } from "@/lib/utils";
import type { LocationClass } from "@/modules/location/eligibility";

export type CompareRole = {
  id: string;
  title: string;
  company: string;
  /** The role's page in the app. */
  href: string;
  /** The fit score shown in the feed, 0–100. Null when the role has not been scored. */
  fitScore: number | null;
  /** The match analysis label, when the role has been analysed. */
  classification: MatchClassification | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  location: string | null;
  workplaceType: string | null;
  locationClass: LocationClass | null;
  locationFlags: string[];
  /** Why the role is not open to this person where it is, or null when it is. */
  locationBlocker: LocationBlocker | null;
  /** When the role was posted, or first seen when the board gave no date (ISO). */
  postedAt: string;
  postedAtSource: "provider" | "first_seen";
  fitReasons: string[];
  topConcern: string | null;
  matchingSkills: string[];
  requirements: string[];
  niceToHave: string[];
  technologies: string[];
  /** Where the role is in the tracker: "Saved", "Applied", "Not saved", … */
  trackerStatus: string;
  /** Resume match, 0–100, when there is a resume to score against. */
  resumeScore: number | null;
};

/** Enough to show a role in a tray slot or as the drag preview. */
export type CompareRoleSummary = Pick<CompareRole, "id" | "title" | "company" | "fitScore">;

export function roleSubject(role: { title: string; company: string }): string {
  return `${role.title} at ${role.company}`;
}

// ---------------------------------------------------------------------------
// Work arrangement and location
// ---------------------------------------------------------------------------

export type Workplace = "remote" | "hybrid" | "on_site";

/** Boards spell on-site several ways; null when the posting does not say. */
export function normalizeWorkplace(value: string | null | undefined): Workplace | null {
  const key = (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "remote") return "remote";
  if (key === "hybrid") return "hybrid";
  if (key === "on_site" || key === "onsite" || key === "in_office" || key === "office") return "on_site";
  return null;
}

export type LocationBlocker = {
  /** Short, for the score breakdown: "Needs US work authorization". */
  detail: string;
  /** A sentence for the verdict: "It needs US work authorization." */
  caution: string;
};

/** Which in-area arrangements the person wants (Settings → Search preferences). */
export type LocationOptIns = {
  includeHybridGta: boolean;
  includeOnsiteGta: boolean;
};

const ALL_IN_AREA: LocationOptIns = { includeHybridGta: true, includeOnsiteGta: true };

/**
 * Why a role is not open to this person where it is, or null when it is:
 * Remote-Canada always is, and hybrid or on-site in their area is when they
 * have those turned on. Needing US work authorization, being remote outside
 * Canada, or being out of the area all block it.
 */
export function locationBlocker(
  locationClass: LocationClass | null,
  flags: readonly string[],
  optIns: LocationOptIns = ALL_IN_AREA
): LocationBlocker | null {
  if (flags.includes("us_work_authorization") || flags.includes("us_only")) {
    return { detail: "Needs US work authorization", caution: "It needs US work authorization." };
  }
  switch (locationClass) {
    case "remote_canada":
      return null;
    case "hybrid_gta":
      return optIns.includeHybridGta
        ? null
        : {
            detail: "Hybrid, which is off in your Settings",
            caution: "It is hybrid, which you have turned off in Settings.",
          };
    case "onsite_gta":
      return optIns.includeOnsiteGta
        ? null
        : {
            detail: "On-site, which is off in your Settings",
            caution: "It is on-site, which you have turned off in Settings.",
          };
    case "remote_other":
      return { detail: "Remote outside Canada", caution: "It is remote outside Canada." };
    case "out_of_area":
      return { detail: "Outside your area", caution: "It is outside your area." };
    default:
      // Not known: scoring treats it as unknown (half points), not as a blocker.
      return null;
  }
}

// ---------------------------------------------------------------------------
// Leaders in the comparison table
// ---------------------------------------------------------------------------

export type ComparisonHighlights = {
  /** Ids with the highest fit score. Empty when every role scores the same. */
  bestFit: string[];
  /** Ids with the highest salary. Empty when salaries cannot be ranked. */
  topSalary: string[];
  /** Set when salaries are listed in more than one currency, so they are not ranked. */
  salaryCurrencies: string[] | null;
  /** Ids posted most recently. Empty when every role was posted at the same time. */
  newest: string[];
};

/** The salary the feed's "Highest salary" sort uses: the top of the range. */
export function salaryValue(role: Pick<CompareRole, "salaryMin" | "salaryMax">): number | null {
  return role.salaryMax ?? role.salaryMin ?? null;
}

/** Currencies of the roles that list a salary, sorted. More than one means they cannot be ranked. */
export function salaryCurrencies(roles: readonly CompareRole[]): string[] {
  const listed = roles.filter((role) => salaryValue(role) !== null);
  return Array.from(new Set(listed.map((role) => role.salaryCurrency ?? "CAD"))).sort();
}

/**
 * Ids that share the top value. Nothing is highlighted when fewer than two
 * roles have a value, or when they all tie, since a marker on every column
 * says nothing.
 */
function leaders(values: ReadonlyArray<{ id: string; value: number | null }>): string[] {
  const known = values.filter((entry): entry is { id: string; value: number } => entry.value !== null);
  if (known.length < 2) return [];
  const top = Math.max(...known.map((entry) => entry.value));
  const ids = known.filter((entry) => entry.value === top).map((entry) => entry.id);
  return ids.length === known.length ? [] : ids;
}

/** Which roles lead on fit, pay, and freshness. Used to mark the winners in each row. */
export function comparisonHighlights(roles: readonly CompareRole[]): ComparisonHighlights {
  const currencies = salaryCurrencies(roles);
  const mixedCurrency = currencies.length > 1;
  return {
    bestFit: leaders(roles.map((role) => ({ id: role.id, value: role.fitScore }))),
    topSalary: mixedCurrency
      ? []
      : leaders(roles.map((role) => ({ id: role.id, value: salaryValue(role) }))),
    salaryCurrencies: mixedCurrency ? currencies : null,
    newest: leaders(roles.map((role) => ({ id: role.id, value: new Date(role.postedAt).getTime() }))),
  };
}
