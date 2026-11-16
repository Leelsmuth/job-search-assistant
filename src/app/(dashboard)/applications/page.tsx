import Link from "next/link";
import { listTrackedApplications } from "@/server/actions/application-tracker-actions";
import { AddApplicationForm } from "./add-application-form";
import { ApplicationsBoard } from "./applications-board";
import { ApplicationsList } from "./applications-list";
import { TrackerFilters, TrackerViewToggle } from "./tracker-nav";
import {
  TRACKER_STAGES,
  parseTrackerQuery,
  selectApplications,
  stageCounts,
  trackerHref,
  type TrackerStage,
} from "@/modules/applications/tracker";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
        <TrackerViewToggle query={query} />
      </div>

      <TrackerFilters query={query} counts={counts} />

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
