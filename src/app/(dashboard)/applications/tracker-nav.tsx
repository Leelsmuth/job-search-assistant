import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  TRACKER_STAGES,
  statusLabel,
  trackerHref,
  type TrackerQuery,
  type TrackerStage,
} from "@/modules/applications/tracker";

/**
 * View toggle, status filter, and sort links for the tracker.
 * Shared by the signed-in tracker (/applications) and the demo (/demo/applications).
 */

export function TrackerViewToggle({
  query,
  basePath = "/applications",
}: {
  query: TrackerQuery;
  basePath?: string;
}) {
  return (
    <div className="flex gap-2" aria-label="Application view">
      <Button
        variant={query.view === "list" ? "default" : "outline"}
        size="sm"
        className="min-h-10 flex-1 sm:flex-none"
        asChild
      >
        <Link
          href={trackerHref(query, { view: "list" }, basePath)}
          aria-current={query.view === "list" ? "page" : undefined}
        >
          List
        </Link>
      </Button>
      <Button
        variant={query.view === "board" ? "default" : "outline"}
        size="sm"
        className="min-h-10 flex-1 sm:flex-none"
        asChild
      >
        <Link
          href={trackerHref(query, { view: "board" }, basePath)}
          aria-current={query.view === "board" ? "page" : undefined}
        >
          Board
        </Link>
      </Button>
    </div>
  );
}

export function TrackerFilters({
  query,
  counts,
  basePath = "/applications",
}: {
  query: TrackerQuery;
  counts: Record<TrackerStage | "all", number>;
  basePath?: string;
}) {
  return (
    <div className="space-y-3">
      <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        <FilterLink
          href={trackerHref(query, { status: "all" }, basePath)}
          current={query.status === "all"}
        >
          All <span>{counts.all}</span>
        </FilterLink>
        {TRACKER_STAGES.map((stage) => (
          <FilterLink
            key={stage}
            href={trackerHref(query, { status: stage }, basePath)}
            current={query.status === stage}
          >
            {statusLabel(stage)} <span>{counts[stage]}</span>
          </FilterLink>
        ))}
      </nav>
      <div className="flex flex-wrap gap-2" aria-label="Sort applications">
        <SortLink query={query} sort="activity" label="Last activity" basePath={basePath} />
        <SortLink query={query} sort="applied" label="Date applied" basePath={basePath} />
      </div>
    </div>
  );
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

function SortLink({
  query,
  sort,
  label,
  basePath,
}: {
  query: TrackerQuery;
  sort: TrackerQuery["sort"];
  label: string;
  basePath: string;
}) {
  const active = query.sort === sort;
  const nextDir = active && query.dir === "desc" ? "asc" : "desc";
  const direction = active ? (query.dir === "desc" ? "newest first" : "oldest first") : "newest first";
  return (
    <Link
      href={trackerHref(query, { sort, dir: active ? nextDir : "desc" }, basePath)}
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
