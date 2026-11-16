"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JobsFeedSkeleton } from "@/components/jobs/jobs-feed-skeleton";
import { useToast } from "@/components/ui/use-toast";
import { classificationColor, cn, formatSalary } from "@/lib/utils";
import { LOCATION_CLASS_LABELS } from "@/modules/location/eligibility";
import { postingAgeClass, postingAgeLabel } from "@/modules/jobs/posting-age";
import { pipelineStage, statusLabel } from "@/modules/applications/tracker";
import {
  DEFAULT_DEMO_FEED_FILTERS,
  selectDemoFeed,
  type DemoFeedFilters,
  type DemoFeedItem,
  type DemoFeedSort,
  type DemoWorkplaceFilter,
} from "@/modules/demo/demo-state";
import { demoActions, useDemoState } from "./demo-store";
import { DEMO_TRACKER_HREF, demoJobHref } from "./demo-links";

const selectClass = "mt-1 block min-h-10 rounded-md border border-input bg-background px-2 text-sm";

export function DemoFeed() {
  const state = useDemoState();
  const [filters, setFilters] = useState<DemoFeedFilters>(DEFAULT_DEMO_FEED_FILTERS);

  if (!state) return <JobsFeedSkeleton message="Loading the demo…" />;

  const { items, dismissedCount } = selectDemoFeed(state, filters);
  const patch = (next: Partial<DemoFeedFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const filtered =
    filters.search.trim() !== "" || filters.workplace !== "all" || filters.showDismissed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Job Feed</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} sample roles, scored against a sample frontend profile. Save one to add it
          to your tracker.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div>
          <Label htmlFor="demo-search" className="text-xs">
            Search
          </Label>
          <Input
            id="demo-search"
            type="search"
            className="mt-1 w-full sm:max-w-md"
            placeholder="Title, company, or skill"
            value={filters.search}
            onChange={(event) => patch({ search: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="demo-workplace" className="text-xs">
              Workplace
            </Label>
            <select
              id="demo-workplace"
              className={selectClass}
              value={filters.workplace}
              onChange={(event) => patch({ workplace: event.target.value as DemoWorkplaceFilter })}
            >
              <option value="all">All</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="on_site">On-site</option>
            </select>
          </div>
          <div>
            <Label htmlFor="demo-sort" className="text-xs">
              Sort
            </Label>
            <select
              id="demo-sort"
              className={selectClass}
              value={filters.sort}
              onChange={(event) => patch({ sort: event.target.value as DemoFeedSort })}
            >
              <option value="match">Best match</option>
              <option value="newest">Newest posted</option>
              <option value="salary">Highest salary</option>
            </select>
          </div>
          <Button
            variant={filters.showDismissed ? "default" : "outline"}
            size="sm"
            className="min-h-10"
            aria-pressed={filters.showDismissed}
            onClick={() => patch({ showDismissed: !filters.showDismissed })}
          >
            {filters.showDismissed ? "Hide dismissed" : `Show dismissed (${dismissedCount})`}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No sample jobs match these filters.</p>
            {filtered ? (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setFilters(DEFAULT_DEMO_FEED_FILTERS)}
              >
                Clear filters
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2" aria-label="Sample jobs">
          {items.map((item) => (
            <li key={item.job.id}>
              <DemoJobRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DemoJobRow({ item }: { item: DemoFeedItem }) {
  const { job, isSaved, isDismissed, trackedStatus } = item;
  const router = useRouter();
  const { toast } = useToast();
  const age = postingAgeLabel({
    postedAt: item.postedAt,
    postedAtSource: "provider",
    dateDiscovered: item.postedAt,
  });
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const subject = `${job.title} at ${job.company}`;

  function toggleSave() {
    if (isSaved) {
      demoActions.unsaveJob(job.id);
      toast({
        title: "Unsaved",
        description: trackedStatus
          ? "It stays in your tracker, the same as in the full app."
          : undefined,
      });
      return;
    }
    demoActions.saveJob(job.id);
    toast({
      title: "Job saved",
      description: trackedStatus
        ? `Already in your tracker as ${statusLabel(trackedStatus)}.`
        : "Added to your applications as Saved.",
      action: { label: "Open tracker", onClick: () => router.push(DEMO_TRACKER_HREF) },
    });
  }

  function toggleDismiss() {
    if (isDismissed) {
      demoActions.restoreJob(job.id);
      toast({ title: "Job restored" });
      return;
    }
    demoActions.dismissJob(job.id);
    toast({
      title: "Job dismissed",
      action: { label: "Undo", onClick: () => demoActions.restoreJob(job.id) },
    });
  }

  return (
    <Card className={cn("transition-colors hover:bg-accent/50", isDismissed && "opacity-60")}>
      <CardContent className="space-y-3 p-4 sm:space-y-0">
        <Link
          href={demoJobHref(job.id)}
          className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4"
        >
          <div className="w-12 shrink-0 text-center sm:w-14">
            <div className="text-lg font-bold sm:text-xl">{job.fitScore}</div>
            <div className="text-[10px] text-muted-foreground sm:text-xs">fit</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h2 className="line-clamp-2 font-semibold leading-snug sm:truncate">{job.title}</h2>
              <Badge className="border border-border bg-transparent">
                {LOCATION_CLASS_LABELS[job.locationClass]}
              </Badge>
              {job.locationFlags.includes("us_work_authorization") ? (
                <Badge className="bg-amber-100 text-amber-900">US auth</Badge>
              ) : null}
              <Badge className={classificationColor(job.classification)}>{job.classification}</Badge>
              {isSaved ? (
                <Badge className="border border-blue-300 bg-transparent text-blue-700">saved</Badge>
              ) : null}
              {/* "saved" above already covers roles that have not moved on. */}
              {trackedStatus && pipelineStage(trackedStatus) !== "saved" ? (
                <Badge className="bg-secondary text-secondary-foreground">
                  {statusLabel(trackedStatus)}
                </Badge>
              ) : null}
              {isDismissed ? (
                <Badge className="bg-muted text-muted-foreground">dismissed</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {job.company} · {job.location} · {job.workplaceType.replace("_", "-")}
            </p>
            <p className={cn("mt-1 text-xs font-medium", postingAgeClass(age.tone))}>{age.text}</p>
            <p className="mt-1 text-xs text-muted-foreground sm:hidden">{salary ?? "—"}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:truncate">
              {job.fitReasons.slice(0, 2).join(" · ")}
            </p>
            {job.topConcern ? (
              <p className="mt-1 line-clamp-2 text-xs text-orange-700 sm:truncate">
                Gap: {job.topConcern}
              </p>
            ) : null}
          </div>
          <div className="hidden shrink-0 text-right text-sm text-muted-foreground md:block">
            <div>{salary ?? "—"}</div>
            <div className="text-xs">{job.matchingSkills.slice(0, 2).join(", ")}</div>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 sm:border-0 sm:pt-0">
          <span className="inline-flex min-h-10 items-center rounded-full border border-border px-2.5 text-xs font-semibold">
            {job.sourceLabel}
          </span>
          <Button
            variant={isSaved ? "secondary" : "outline"}
            size="sm"
            className="min-h-10"
            aria-pressed={isSaved}
            aria-label={isSaved ? `Unsave ${subject}` : `Save ${subject}`}
            onClick={toggleSave}
          >
            {isSaved ? "Saved" : "Save"}
          </Button>
          {trackedStatus ? (
            <Button asChild variant="outline" size="sm" className="min-h-10">
              <Link href={DEMO_TRACKER_HREF}>View in tracker</Link>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10"
            aria-label={isDismissed ? `Restore ${subject}` : `Dismiss ${subject}`}
            onClick={toggleDismiss}
          >
            {isDismissed ? "Restore" : "Dismiss"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
