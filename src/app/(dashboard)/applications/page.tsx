import type { ReactNode } from "react";
import Link from "next/link";
import { listTrackedApplications } from "@/server/actions/application-tracker-actions";
import { Button } from "@/components/ui/button";
import { AddApplicationForm } from "./add-application-form";
import { ApplicationsBoard } from "./applications-board";
import { ApplicationsList } from "./applications-list";
import {
  TRACKER_STAGES,
  parseTrackerQuery,
  selectApplications,
  stageCounts,
  statusLabel,
  trackerHref,
  type TrackerQuery,
  type TrackerStage,
} from "@/modules/applications/tracker";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function FilterLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        current
          ? "inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-3 text-sm text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          : "inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      }
    >
      {children}
    </Link>
  );
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[];
    status?: string | string[];
    sort?: string | string[];
    dir?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const query = parseTrackerQuery({
    view: firstParam(params.view),
    status: firstParam(params.status),
    sort: firstParam(params.sort),
    dir: firstParam(params.dir),
  });
  const applications = await listTrackedApplications();
  const visible = selectApplications(applications, query);
  const counts = stageCounts(applications);
  const attentionCount = applications.filter((application) => application.attention.length > 0).length;
  const stages: TrackerStage[] = query.status === "all" ? [...TRACKER_STAGES] : [query.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {applications.length === 0
              ? "Nothing logged yet."
              : `${applications.length} logged${attentionCount > 0 ? ` · ${attentionCount} need attention` : ""}`}
          </p>
        </div>
        <div className="flex gap-2" aria-label="Application view">
          <Button
            variant={query.view === "list" ? "default" : "outline"}
            size="sm"
            className="min-h-10 flex-1 sm:flex-none"
            asChild
          >
            <Link href={trackerHref(query, { view: "list" })} aria-current={query.view === "list" ? "page" : undefined}>
              List
            </Link>
          </Button>
          <Button
            variant={query.view === "board" ? "default" : "outline"}
            size="sm"
            className="min-h-10 flex-1 sm:flex-none"
            asChild
          >
            <Link href={trackerHref(query, { view: "board" })} aria-current={query.view === "board" ? "page" : undefined}>
              Board
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
          <FilterLink href={trackerHref(query, { status: "all" })} current={query.status === "all"}>
            All <span>{counts.all}</span>
          </FilterLink>
          {TRACKER_STAGES.map((stage) => (
            <FilterLink
              key={stage}
              href={trackerHref(query, { status: stage })}
              current={query.status === stage}
            >
              {statusLabel(stage)} <span>{counts[stage]}</span>
            </FilterLink>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2" aria-label="Sort applications">
          <SortLink query={query} sort="activity" label="Last activity" />
          <SortLink query={query} sort="applied" label="Date applied" />
        </div>
      </div>

      <details
        className="rounded-lg border border-border bg-card"
        {...(applications.length === 0 ? { open: true } : {})}
      >
        <summary className="cursor-pointer list-none rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="inline-flex min-h-10 items-center">Add an application</span>
        </summary>
        <div className="border-t border-border p-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Log a role you found outside the feed. This creates a job you own and an application for it.
          </p>
          <AddApplicationForm />
        </div>
      </details>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-border px-4 py-12 text-center">
          <p className="text-muted-foreground">
            {applications.length === 0
              ? "No applications yet. Save a job from the feed, or add one you found elsewhere."
              : "No applications match this filter."}
          </p>
          {applications.length === 0 ? (
            <Link href="/jobs" className="mt-4 inline-flex min-h-10 items-center text-sm text-blue-600 hover:underline">
              Browse job feed
            </Link>
          ) : (
            <Link
              href={trackerHref(query, { status: "all" })}
              className="mt-4 inline-flex min-h-10 items-center text-sm text-blue-600 hover:underline"
            >
              Show all statuses
            </Link>
          )}
        </div>
      ) : query.view === "board" ? (
        <ApplicationsBoard applications={visible} stages={stages} />
      ) : (
        <ApplicationsList applications={visible} />
      )}
    </div>
  );
}

function SortLink({
  query,
  sort,
  label,
}: {
  query: TrackerQuery;
  sort: TrackerQuery["sort"];
  label: string;
}) {
  const active = query.sort === sort;
  const nextDir = active && query.dir === "desc" ? "asc" : "desc";
  const direction = active ? (query.dir === "desc" ? "newest first" : "oldest first") : "newest first";
  return (
    <Link
      href={trackerHref(query, { sort, dir: active ? nextDir : "desc" })}
      aria-current={active ? "true" : undefined}
      aria-label={active ? `${label}, ${direction}. Activate to reverse.` : `Sort by ${label.toLowerCase()}`}
      className={
        active
          ? "inline-flex min-h-10 items-center rounded-md bg-secondary px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          : "inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
    >
      {label}
      {active ? <span className="ml-2 text-xs text-muted-foreground">{direction}</span> : null}
    </Link>
  );
}
