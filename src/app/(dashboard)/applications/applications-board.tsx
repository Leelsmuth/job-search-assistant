"use client";

import Link from "next/link";
import { ApplicationControls, AttentionBadges } from "./application-controls";
import { ApplicationTitle } from "./applications-list";
import { jobHrefFor, useTrackerAdapter } from "@/components/applications/tracker-adapter";
import {
  formatDisplayDate,
  statusLabel,
  type TrackedApplication,
  type TrackerStage,
} from "@/modules/applications/tracker";

function ViewJobLink({ application }: { application: TrackedApplication }) {
  const href = jobHrefFor(useTrackerAdapter(), application);
  if (!href) return null;
  return (
    <Link href={href} className="text-muted-foreground hover:underline">
      View job
    </Link>
  );
}

export function ApplicationsBoard({
  applications,
  stages,
}: {
  applications: TrackedApplication[];
  stages: TrackerStage[];
}) {
  return (
    <div
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0"
      aria-label="Applications by status"
    >
      {stages.map((stage) => {
        const items = applications.filter((application) => application.stage === stage);
        return (
          <section
            key={stage}
            aria-labelledby={`stage-${stage}`}
            className="w-[min(100%,18rem)] shrink-0 rounded-lg border border-border bg-muted/30 p-3"
          >
            <h2 id={`stage-${stage}`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {statusLabel(stage)} ({items.length})
            </h2>
            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                items.map((application) => (
                  <article
                    key={application.id}
                    className={
                      application.attention.length > 0
                        ? "space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3"
                        : "space-y-2 rounded-md border border-border bg-card p-3"
                    }
                  >
                    <div>
                      <ApplicationTitle application={application} className="font-medium leading-snug" />
                      <p className="text-xs text-muted-foreground">
                        {application.companyName}
                        {application.fitScore != null ? ` · Fit ${application.fitScore}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{application.locationLabel}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Applied{" "}
                        <time dateTime={application.dateApplied ?? undefined}>
                          {formatDisplayDate(application.dateApplied)}
                        </time>
                      </p>
                    </div>
                    <AttentionBadges flags={application.attention} />
                    <div className="flex flex-wrap gap-x-3 text-xs">
                      {application.jobUrl ? (
                        <a
                          href={application.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Job posting
                        </a>
                      ) : null}
                      <ViewJobLink application={application} />
                    </div>
                    {application.status !== application.stage ? (
                      <p className="text-xs text-muted-foreground">
                        Current status: {statusLabel(application.status)}
                      </p>
                    ) : null}
                    <ApplicationControls
                      key={`${application.id}:${application.status}:${application.notes ?? ""}:${application.followUpDate ?? ""}`}
                      application={application}
                    />
                  </article>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
