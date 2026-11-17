"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, TriangleAlert, Trophy, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { classificationColor, cn, formatSalary } from "@/lib/utils";
import { LOCATION_CLASS_LABELS } from "@/modules/location/eligibility";
import { postingAgeClass, postingAgeLabel } from "@/modules/jobs/posting-age";
import { formatWorkLocation } from "@/modules/applications/tracker";
import { comparisonHighlights, type CompareRole, type ComparisonHighlights } from "@/modules/compare/role";
import {
  PRIORITIES,
  formatTenths,
  priorityVerdict,
  scoreRoles,
  type PriorityResult,
} from "@/modules/compare/priorities";
import { COMPARE_MIN } from "@/modules/compare/slots";
import { useCompare } from "./compare-context";
import { PrioritiesPanel } from "./priorities";

/** The trigger is the tray's Compare button; Radix returns focus to it on close. */
export function CompareDialog({
  open,
  onOpenChange,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
}) {
  const compare = useCompare();
  const [prioritiesOpen, setPrioritiesOpen] = useState(false);
  if (!compare) return null;

  const { order } = compare.priorities;
  // Columns follow the tray's slot order; empty slots are skipped.
  const roles = compare.roles;
  const result = roles ? scoreRoles(roles, order) : null;
  const verdict = roles && result ? priorityVerdict(roles, order, result) : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-card text-card-foreground focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-7xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-border sm:shadow-lg">
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold">Compare roles</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {roles ? `${roles.length} roles` : "Roles"} side by side, scored on your priorities.
                The strongest fit, pay, and freshness are marked.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          {verdict && result ? <VerdictNote verdict={verdict} result={result} /> : null}
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside
              aria-labelledby="compare-priorities-heading"
              className="shrink-0 border-b border-border lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r"
            >
              {/* Phones and tablets: folded away by default, so the table keeps its room. */}
              <button
                type="button"
                aria-expanded={prioritiesOpen}
                aria-controls="compare-priorities-panel"
                onClick={() => setPrioritiesOpen((value) => !value)}
                className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm lg:hidden"
              >
                <span className="font-semibold">Your priorities</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {order.map((id) => PRIORITIES[id].label).join(" › ")}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 transition-transform", prioritiesOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              <div
                id="compare-priorities-panel"
                className={cn(
                  "max-h-[45dvh] overflow-y-auto px-4 pb-4 lg:block lg:max-h-none lg:overflow-visible lg:pt-4",
                  prioritiesOpen ? "block" : "hidden"
                )}
              >
                <h3 id="compare-priorities-heading" className="mb-2 hidden text-sm font-semibold lg:block">
                  Your priorities
                </h3>
                <PrioritiesPanel showDescriptions={false} />
              </div>
            </aside>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              {roles && result ? (
                <CompareTable roles={roles} result={result} />
              ) : (
                <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground" role="status">
                  <Spinner className="shrink-0" />
                  Loading the roles…
                </p>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

type CompareRow = {
  label: string;
  note?: string;
  /** Whether this role leads the row (best fit, highest salary, newest). */
  leads?: (role: CompareRole) => boolean;
  render: (role: CompareRole) => React.ReactNode;
};

/** Fixed widths per column count, so columns stay readable and scroll sideways on phones. */
const TABLE_MIN_WIDTH: Record<number, string> = {
  2: "min-w-[34rem]",
  3: "min-w-[47rem]",
  4: "min-w-[60rem]",
};

function CompareTable({ roles, result }: { roles: CompareRole[]; result: PriorityResult }) {
  const compare = useCompare();
  const highlights = comparisonHighlights(roles);
  const rows = [
    scoreRow(result),
    ...compareRows(highlights, {
      skillsNote: compare?.copy.skillsNote ?? "",
      showResume: roles.some((role) => role.resumeScore !== null),
    }),
  ];
  // Removing down to one role would leave nothing to compare; the tray handles that.
  const removable = roles.length > COMPARE_MIN;

  return (
    <table
      className={cn(
        "w-full table-fixed border-separate border-spacing-0 text-left text-sm",
        TABLE_MIN_WIDTH[roles.length]
      )}
    >
      <caption className="sr-only">
        Comparison of {roles.map((role) => `${role.title} at ${role.company}`).join(", ")}
      </caption>
      <colgroup>
        <col className="w-28 sm:w-32" />
        {roles.map((role) => (
          <col key={role.id} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <td className="sticky left-0 top-0 z-20 border-b border-border bg-card" />
          {roles.map((role) => (
            <th
              key={role.id}
              scope="col"
              className="sticky top-0 z-10 border-b border-l border-border bg-card px-3 py-3 align-top font-normal"
            >
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <Link
                    href={role.href}
                    className="font-semibold leading-snug underline-offset-2 hover:underline"
                  >
                    {role.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{role.company}</p>
                </div>
                {removable ? (
                  <button
                    type="button"
                    aria-label={`Remove ${role.title} at ${role.company} from compare`}
                    className="-mr-2 -mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => compare?.remove(role.id)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th
              scope="row"
              className="sticky left-0 z-10 break-words border-b border-border bg-card px-3 py-3 align-top text-xs font-semibold text-muted-foreground sm:px-4"
            >
              {row.label}
              {row.note ? <span className="mt-1 block text-[11px] font-normal">{row.note}</span> : null}
            </th>
            {roles.map((role) => (
              <td
                key={role.id}
                className={cn(
                  "border-b border-l border-border px-3 py-3 align-top",
                  row.leads?.(role) && "bg-emerald-50"
                )}
              >
                {row.render(role)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Leader({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      <Check className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function needsUsAuthorization(role: CompareRole): boolean {
  return role.locationFlags.includes("us_work_authorization") || role.locationFlags.includes("us_only");
}

function eligibilityUnclear(role: CompareRole): boolean {
  return (
    role.locationFlags.includes("visa_sponsorship_ambiguous") ||
    role.locationFlags.includes("eligibility_ambiguous")
  );
}

function compareRows(
  highlights: ComparisonHighlights,
  options: { skillsNote: string; showResume: boolean }
): CompareRow[] {
  const bestFit = new Set(highlights.bestFit);
  const topSalary = new Set(highlights.topSalary);
  const newest = new Set(highlights.newest);

  const rows: CompareRow[] = [
    {
      label: "Fit",
      leads: (role) => bestFit.has(role.id),
      render: (role) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-bold leading-none">{role.fitScore ?? "—"}</span>
          {role.classification ? (
            <Badge className={classificationColor(role.classification)}>{role.classification}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Not analysed yet</span>
          )}
          {bestFit.has(role.id) ? <Leader>Best fit</Leader> : null}
        </div>
      ),
    },
    {
      label: "Salary",
      note: highlights.salaryCurrencies
        ? `${highlights.salaryCurrencies.join(" and ")}, so not ranked`
        : undefined,
      leads: (role) => topSalary.has(role.id),
      render: (role) => (
        <div className="space-y-1">
          <p className="font-medium">
            {formatSalary(role.salaryMin, role.salaryMax, role.salaryCurrency ?? "CAD") ?? "Not listed"}
          </p>
          {topSalary.has(role.id) ? <Leader>Highest</Leader> : null}
        </div>
      ),
    },
    {
      label: "Eligibility",
      render: (role) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge className="border border-border bg-transparent">
            {role.locationClass ? LOCATION_CLASS_LABELS[role.locationClass] : "Location unknown"}
          </Badge>
          {needsUsAuthorization(role) ? <Badge className="bg-amber-100 text-amber-900">US auth</Badge> : null}
          {eligibilityUnclear(role) ? (
            <Badge className="bg-amber-100 text-amber-900">Eligibility unclear</Badge>
          ) : null}
        </div>
      ),
    },
    {
      label: "Location",
      render: (role) => formatWorkLocation(role.location, role.workplaceType),
    },
    {
      label: "Posted",
      leads: (role) => newest.has(role.id),
      render: (role) => {
        const postedAt = new Date(role.postedAt);
        const age = postingAgeLabel({
          postedAt,
          postedAtSource: role.postedAtSource,
          dateDiscovered: postedAt,
        });
        return (
          <div className="space-y-1">
            <p className={cn("font-medium", postingAgeClass(age.tone))}>{age.text}</p>
            {newest.has(role.id) ? <Leader>Newest</Leader> : null}
          </div>
        );
      },
    },
    {
      label: "Why it fits",
      render: (role) => <List items={role.fitReasons} empty="No reasons recorded." />,
    },
    {
      label: "Gap",
      render: (role) =>
        role.topConcern ? (
          <p className="text-orange-700">{role.topConcern}</p>
        ) : (
          <p className="text-muted-foreground">None found</p>
        ),
    },
    {
      label: "Requirements",
      render: (role) => <List items={role.requirements} empty="None listed." />,
    },
    {
      label: "Nice to have",
      render: (role) => <List items={role.niceToHave} empty="None listed." />,
    },
    {
      label: "Tech stack",
      note: options.skillsNote,
      render: (role) => {
        if (role.technologies.length === 0) return <p className="text-muted-foreground">None listed.</p>;
        const matching = new Set(role.matchingSkills.map((skill) => skill.toLowerCase()));
        return (
          <ul className="flex flex-wrap gap-1.5" aria-label={`Tech stack for ${role.title}`}>
            {role.technologies.map((tech) => {
              const onProfile = matching.has(tech.toLowerCase());
              return (
                <li key={tech}>
                  <Badge
                    className={cn(
                      "gap-1 font-medium",
                      onProfile ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-border bg-muted"
                    )}
                  >
                    {onProfile ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                    {tech}
                    {onProfile ? <span className="sr-only"> (on your profile)</span> : null}
                  </Badge>
                </li>
              );
            })}
          </ul>
        );
      },
    },
  ];

  if (options.showResume) {
    rows.push({
      label: "Resume match",
      render: (role) =>
        role.resumeScore === null ? (
          <p className="text-muted-foreground">Not scored</p>
        ) : (
          <p className="font-medium">{role.resumeScore}</p>
        ),
    });
  }

  rows.push({
    label: "Your tracker",
    render: (role) => <p>{role.trackerStatus}</p>,
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Priority score
// ---------------------------------------------------------------------------

/** The note on which role suits the person best. Announced when the ranking changes it. */
function VerdictNote({
  verdict,
  result,
}: {
  verdict: NonNullable<ReturnType<typeof priorityVerdict>>;
  result: PriorityResult;
}) {
  return (
    <div
      role="status"
      data-testid="compare-verdict"
      className="space-y-1 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 sm:px-6"
    >
      <p className="flex items-start gap-2 font-semibold">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {verdict.headline}
          {verdict.reason ? <span className="font-normal"> {verdict.reason}</span> : null}
        </span>
      </p>
      {verdict.caution ? (
        <p className="flex items-start gap-2 pl-6 font-medium text-amber-900">
          <TriangleAlert className="-ml-6 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {verdict.caution}
        </p>
      ) : null}
      {verdict.fitNudge ? <p className="pl-6">{verdict.fitNudge}</p> : null}
      {result.unscored.map((entry) => (
        <p key={entry.id} className="pl-6 text-xs text-emerald-900/80">
          {entry.reason}
        </p>
      ))}
    </div>
  );
}

/** First row of the table: each role's points per priority, in the person's order. */
function scoreRow(result: PriorityResult): CompareRow {
  const byRole = new Map(result.roles.map((score) => [score.jobId, score]));
  const allTie = result.roles.every((score) => score.rank === 1);
  const best = (role: CompareRole) => !allTie && byRole.get(role.id)?.rank === 1;

  return {
    label: "Your score",
    note: "Points from your priorities",
    leads: best,
    render: (role) => {
      const score = byRole.get(role.id);
      if (!score) return null;
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="leading-none">
              <span className="text-2xl font-bold">{formatTenths(score.totalTenths)}</span>
              <span className="text-xs text-muted-foreground"> of {formatTenths(result.maxTenths)}</span>
            </p>
            {best(role) ? (
              <Leader>Best for you</Leader>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">#{score.rank}</span>
            )}
          </div>
          <ul className="space-y-1.5" aria-label={`Points for ${role.title}`}>
            {score.priorities.map((entry) => {
              const earned = entry.earnedTenths;
              const percent = earned === null ? 0 : (earned / (entry.points * 10)) * 100;
              return (
                <li key={entry.id} className="text-xs" title={entry.detail}>
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{PRIORITIES[entry.id].label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {earned === null ? "not scored" : `${formatTenths(earned)} / ${entry.points}`}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-muted" aria-hidden="true">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        // Half points for something the posting does not say: shown apart, so it reads as a guess.
                        entry.unknown ? "bg-emerald-600/40" : "bg-emerald-600"
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  {entry.unknown ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.detail}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      );
    },
  };
}
