"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationsBoard } from "@/app/(dashboard)/applications/applications-board";
import { ApplicationsList } from "@/app/(dashboard)/applications/applications-list";
import { TrackerFilters, TrackerViewToggle } from "@/app/(dashboard)/applications/tracker-nav";
import {
  TRACKER_STAGES,
  selectApplications,
  stageCounts,
  trackerHref,
  type TrackerQuery,
  type TrackerStage,
} from "@/modules/applications/tracker";
import { listDemoTrackedApplications } from "@/modules/demo/demo-state";
import { useDemoState } from "../demo-store";
import { DEMO_FEED_HREF, DEMO_TRACKER_HREF } from "../demo-links";
import {
  ExportCsvButton,
  ImportCsvButton,
  ImportDialogLoading,
} from "@/components/applications/import/csv-actions";

/** The import dialog loads on first use; the tracker page only carries the buttons. */
const loadDemoImportDialog = () => import("./demo-import");
const DemoImportDialog = dynamic(() => loadDemoImportDialog().then((mod) => mod.DemoImportDialog), {
  ssr: false,
  loading: ImportDialogLoading,
});

/** Same tracker UI as /applications, backed by the demo's browser store. */
export function DemoTracker({ query }: { query: TrackerQuery }) {
  const state = useDemoState();
  if (!state) return <TrackerSkeleton />;

  const applications = listDemoTrackedApplications(state);
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
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Spreadsheet">
            <ImportCsvButton
              preload={loadDemoImportDialog}
              renderDialog={(onClose) => <DemoImportDialog onClose={onClose} />}
            />
            <ExportCsvButton applications={applications} />
          </div>
          <TrackerViewToggle query={query} basePath={DEMO_TRACKER_HREF} />
        </div>
      </div>

      <TrackerFilters query={query} counts={counts} basePath={DEMO_TRACKER_HREF} />

      <p className="text-sm text-muted-foreground">
        Change a status to move a role through the pipeline.
        {query.view === "list" ? (
          <>
            {" "}
            Try the{" "}
            <Link
              href={trackerHref(query, { view: "board" }, DEMO_TRACKER_HREF)}
              className="underline"
            >
              board view
            </Link>{" "}
            to see every stage side by side.
          </>
        ) : null}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-border px-4 py-12 text-center">
          <p className="text-muted-foreground">
            {applications.length === 0
              ? "No applications yet. Save a job from the feed, or import the spreadsheet you already keep."
              : "No applications match this filter."}
          </p>
          {applications.length === 0 ? (
            <Link
              href={DEMO_FEED_HREF}
              className="mt-4 inline-flex min-h-10 items-center text-sm text-blue-600 hover:underline"
            >
              Browse job feed
            </Link>
          ) : (
            <Link
              href={trackerHref(query, { status: "all" }, DEMO_TRACKER_HREF)}
              className="mt-4 inline-flex min-h-10 items-center text-sm text-blue-600 hover:underline"
            >
              Show all statuses
            </Link>
          )}
        </div>
      ) : query.view === "board" ? (
        <ApplicationsBoard applications={visible} stages={stages} showAppliedDate />
      ) : (
        <ApplicationsList applications={visible} showAppliedDate />
      )}
    </div>
  );
}

function TrackerSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading applications</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
