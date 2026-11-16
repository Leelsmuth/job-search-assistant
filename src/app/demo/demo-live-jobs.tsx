"use client";

import { ExternalLink, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { postingAgeClass, postingAgeLabel } from "@/modules/jobs/posting-age";
import {
  DEMO_LIVE_BATCH_SIZE,
  DEMO_LIVE_BOARD,
  selectDemoLiveFeed,
  type DemoLiveBatch,
  type DemoLiveFeedFilters,
  type DemoLiveJob,
} from "@/modules/demo/live-jobs";
import { demoLiveActions, useDemoLiveJobs, type DemoLiveState } from "./demo-live-store";
import { DemoSignInPrompt } from "./demo-sign-in-prompt";

const HEADING_ID = "demo-live-jobs-heading";

/**
 * Real postings from one public Greenhouse board, shown above the sample jobs.
 * Loaded on request and kept for the current tab only. Rows are styled apart
 * from sample jobs and carry a "Live" label, have no fit score, open the
 * employer's posting in a new tab, and ask the visitor to sign in to save.
 */
export function DemoLiveJobs({ filters }: { filters: DemoLiveFeedFilters }) {
  const live = useDemoLiveJobs();
  // Nothing to show before hydration; the server does not know this tab's state.
  if (!live) return null;
  if (live.status === "ready") return <LiveJobsList batch={live.batch} filters={filters} />;
  return <LiveJobsInvite state={live} />;
}

function LiveJobsInvite({ state }: { state: Exclude<DemoLiveState, { status: "ready" }> }) {
  const loading = state.status === "loading";
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-1">
        <h2 id={HEADING_ID} className="flex items-center gap-2 font-semibold">
          <Radio className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          See real openings
        </h2>
        <p className="text-sm text-muted-foreground">
          {`Load up to ${DEMO_LIVE_BATCH_SIZE} current postings from ${DEMO_LIVE_BOARD.companyName}'s public ${DEMO_LIVE_BOARD.providerLabel} board, next to the sample jobs.`}{" "}
          They stay in this tab only.
        </p>
        {state.status === "error" ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.message}
          </p>
        ) : null}
      </div>
      <Button
        className="min-h-10 shrink-0"
        loading={loading}
        onClick={() => void demoLiveActions.load()}
      >
        {loading ? "Loading live jobs…" : state.status === "error" ? "Try again" : "Load live jobs"}
      </Button>
    </section>
  );
}

function fetchedTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function LiveJobsList({ batch, filters }: { batch: DemoLiveBatch; filters: DemoLiveFeedFilters }) {
  const jobs = selectDemoLiveFeed(batch, filters);
  // Development-only saved response (DEMO_LIVE_JOBS_SNAPSHOT). Never labelled live.
  const snapshot = batch.source === "snapshot";
  const shown =
    batch.totalOpenings > batch.jobs.length
      ? `Showing ${batch.jobs.length} of ${batch.totalOpenings} openings.`
      : null;

  return (
    <section aria-labelledby={HEADING_ID} className="space-y-2">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 id={HEADING_ID} className="flex items-center gap-2 font-semibold">
            <LiveLabel snapshot={snapshot} />
            {snapshot ? "Snapshot jobs" : "Live jobs"} from {batch.companyName}
          </h2>
          {snapshot ? (
            <p
              role="note"
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            >
              <span className="font-semibold">Development snapshot, not live data.</span>{" "}
              DEMO_LIVE_JOBS_SNAPSHOT is set, so the server loaded a saved {batch.providerLabel}{" "}
              response instead of calling {batch.providerLabel}. Production builds always load live
              jobs.
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {snapshot ? "Saved postings in the shape of the public " : "Real postings from the public "}
            <a
              href={batch.boardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {batch.providerLabel} board
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            , {snapshot ? "loaded" : "fetched"} at {fetchedTime(batch.fetchedAt)}. {shown} They are not scored in the demo;
            sign in to see how roles fit your resume. Kept in this tab only.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10 shrink-0 self-start"
          onClick={() => demoLiveActions.hide()}
        >
          Hide live jobs
        </Button>
      </div>

      {jobs.length === 0 ? (
        <p
          className={cn(
            "rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground",
            snapshot ? "border-amber-300" : "border-emerald-300"
          )}
        >
          {batch.jobs.length === 0
            ? `${batch.companyName} has no open roles on its board right now.`
            : `No ${snapshot ? "snapshot" : "live"} jobs match these filters.`}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={snapshot ? "Snapshot jobs" : "Live jobs"}>
          {jobs.map((job) => (
            <li key={job.id}>
              <LiveJobRow job={job} providerLabel={batch.providerLabel} snapshot={snapshot} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LiveLabel({ snapshot = false }: { snapshot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        snapshot ? "bg-amber-200 text-amber-950" : "bg-emerald-700 text-white"
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", snapshot ? "bg-amber-950" : "bg-white")}
        aria-hidden="true"
      />
      {snapshot ? "Snapshot" : "Live"}
    </span>
  );
}

const WORKPLACE_LABELS: Record<NonNullable<DemoLiveJob["workplaceType"]>, string> = {
  remote: "remote",
  hybrid: "hybrid",
  on_site: "on-site",
};

function LiveJobRow({
  job,
  providerLabel,
  snapshot,
}: {
  job: DemoLiveJob;
  providerLabel: string;
  snapshot: boolean;
}) {
  const subject = `${job.title} at ${job.company}`;
  const postedAt = job.postedAt ? new Date(job.postedAt) : null;
  const age = postedAt
    ? postingAgeLabel({ postedAt, postedAtSource: "provider", dateDiscovered: postedAt })
    : null;
  const workplace = job.workplaceType ? WORKPLACE_LABELS[job.workplaceType] : null;
  // "Remote - Canada" already says remote; only add the workplace when it is new information.
  const workplaceIsNew =
    workplace !== null &&
    !(job.location ?? "").toLowerCase().replace(/[\s-]/g, "").includes(workplace.replace("-", ""));
  const place = [
    job.company,
    job.location ?? "Location not listed",
    workplaceIsNew ? workplace : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className={snapshot ? "border-amber-300 bg-amber-50/40" : "border-emerald-300 bg-emerald-50/40"}>
      <CardContent className="space-y-3 p-4 sm:space-y-0">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          {/* Same width as the sample rows' fit score; the longer snapshot label sizes itself. */}
          <div className={cn("flex shrink-0 justify-center", !snapshot && "w-12 sm:w-14")}>
            <LiveLabel snapshot={snapshot} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 font-semibold leading-snug sm:truncate">{job.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{place}</p>
            {age ? (
              <p className={cn("mt-1 text-xs font-medium", postingAgeClass(age.tone))}>{age.text}</p>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-t pt-3 sm:border-0 sm:pt-0",
            snapshot ? "border-amber-200" : "border-emerald-200"
          )}
        >
          <span className="inline-flex min-h-10 items-center rounded-full border border-border bg-background px-2.5 text-xs font-semibold">
            {providerLabel}
          </span>
          <Button asChild variant="outline" size="sm" className="min-h-10">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open posting: ${subject} (opens in a new tab)`}
            >
              <span className="inline-flex items-center gap-1.5">
                Open posting
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </a>
          </Button>
          <DemoSignInPrompt
            job={job}
            trigger={
              <Button variant="outline" size="sm" className="min-h-10" aria-label={`Save ${subject}`}>
                Save
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
