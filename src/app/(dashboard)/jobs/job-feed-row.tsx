"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Columns3, GripVertical } from "lucide-react";
import {
  toggleSaveJob,
  dismissJob,
  startReviewingJob,
} from "@/server/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { classificationColor, formatSalary } from "@/lib/utils";
import { LOCATION_CLASS_LABELS, isLocationClass } from "@/modules/location/eligibility";
import type { MatchClassification } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import { JobDeleteButton } from "./job-delete-button";
import { ApplyLink } from "@/components/jobs/apply-link";
import { JobSourceBadge } from "@/components/jobs/job-source-badge";
import { ResumeScoreBadge } from "@/components/jobs/resume-score-badge";
import type { JobListItem } from "@/modules/jobs/job-list-item";
import { postingAgeClass, postingAgeLabel } from "@/modules/jobs/posting-age";
import { toggleCompare, useCompare } from "@/components/compare/compare-context";
import { compareDragProps } from "@/components/compare/compare-drag";

export function JobFeedRow({
  job,
  classification,
  isStale,
  lowExtraction,
  isNew,
}: {
  job: JobListItem;
  classification?: MatchClassification;
  isStale: boolean;
  lowExtraction: boolean;
  isNew: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(job.isSaved);
  const match = job.match;
  const actionKey = `feed-${job.id}`;
  const companyName = job.company?.name ?? "Unknown company";
  const subject = `${job.title} at ${companyName}`;
  const compare = useCompare();
  const inCompare = compare?.slots.includes(job.id) ?? false;
  const dragging = compare?.draggingId === job.id;
  const dragProps = compare
    ? compareDragProps(
        { id: job.id, title: job.title, company: companyName, fitScore: job.frontendFit?.score ?? null },
        compare
      )
    : {};
  const age = postingAgeLabel({
    postedAt: job.postedAt,
    postedAtSource: job.postedAtSource,
    dateDiscovered: new Date(job.dateDiscovered),
  });

  return (
    <Card
      {...dragProps}
      className={cn(
        "group relative transition-colors hover:bg-accent/50",
        deleting && "pointer-events-none opacity-60",
        inCompare && "border-primary/40",
        dragging && "opacity-50"
      )}
      aria-busy={deleting}
    >
      {compare ? (
        // Touch devices cannot drag; the Compare button below covers them.
        <span
          aria-hidden="true"
          title="Drag to compare"
          className="absolute inset-y-0 left-0 hidden w-5 cursor-grab items-center justify-center text-muted-foreground/50 group-hover:text-muted-foreground active:cursor-grabbing sm:flex"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      ) : null}
      <CardContent className={cn("space-y-3 p-4 sm:space-y-0", compare && "sm:pl-6")}>
        <Link href={`/jobs/${job.id}`} className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <div className="w-12 shrink-0 text-center sm:w-14">
            <div className="text-lg font-bold sm:text-xl">
              {job.frontendFit ? job.frontendFit.score : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground sm:text-xs">fit</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="line-clamp-2 font-semibold leading-snug sm:truncate">{job.title}</h3>
              {isLocationClass(job.locationClass) ? (
                <Badge className="border border-border bg-transparent">
                  {LOCATION_CLASS_LABELS[job.locationClass]}
                </Badge>
              ) : null}
              {job.locationFlags.includes("us_only") ||
              job.locationFlags.includes("us_work_authorization") ? (
                <Badge className="bg-amber-100 text-amber-900">US auth</Badge>
              ) : null}
              {job.locationFlags.includes("visa_sponsorship_ambiguous") ||
              job.locationFlags.includes("eligibility_ambiguous") ? (
                <Badge className="bg-amber-100 text-amber-900">Eligibility unclear</Badge>
              ) : null}
              {classification && (
                <Badge className={classificationColor(classification)}>{classification}</Badge>
              )}
              {saved && (
                <Badge className="border border-blue-300 bg-transparent text-blue-700">saved</Badge>
              )}
              <ResumeScoreBadge score={job.resumeScore} />
              {isNew && <Badge className="bg-green-100 text-green-900">new</Badge>}
              {isStale && <Badge className="bg-amber-100 text-amber-900">Needs rescore</Badge>}
              {lowExtraction && (
                <Badge className="border border-amber-300 bg-transparent text-amber-800">
                  low extraction
                </Badge>
              )}
              {deleting ? (
                <Badge className="bg-muted text-muted-foreground">Deleting...</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {job.company?.name ?? "Unknown"} · {job.location ?? "—"} · {job.workplaceType ?? "—"}
            </p>
            <p className={cn("mt-1 text-xs font-medium", postingAgeClass(age.tone))}>{age.text}</p>
            <p className="mt-1 text-xs text-muted-foreground sm:hidden">
              {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency ?? "CAD") ?? "—"}
            </p>
            {job.frontendFit?.reasons[0] ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:truncate">
                {job.frontendFit.reasons.slice(0, 2).join(" · ")}
              </p>
            ) : null}
            {match?.topConcern && (
              <p className="mt-1 line-clamp-2 text-xs text-orange-700 sm:truncate">
                Gap: {match.topConcern}
              </p>
            )}
          </div>
          <div className="hidden shrink-0 text-right text-sm text-muted-foreground md:block">
            <div>
              {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency ?? "CAD") ?? "—"}
            </div>
            <div className="text-xs">
              {match?.topMatchingSkills?.slice(0, 2).join(", ")}
            </div>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 sm:border-0 sm:pt-0">
          <JobSourceBadge provider={job.sourceProvider} />
          <ApplyLink jobId={job.id} jobUrl={job.jobUrl} variant="default" className="min-h-10" />
          <Button
            variant={saved ? "secondary" : "outline"}
            size="sm"
            className="min-h-10"
            loading={isKeyPending(`${actionKey}-save`)}
            onClick={() =>
              run(`${actionKey}-save`, async () => {
                try {
                  await toggleSaveJob(job.id, !saved);
                  setSaved(!saved);
                  router.refresh();
                  toast({ title: saved ? "Unsaved" : "Job saved" });
                } catch (e) {
                  toast({
                    title: "Failed",
                    description: e instanceof Error ? e.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            {saved ? "Saved" : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-10"
            loading={isKeyPending(`${actionKey}-review`)}
            onClick={() =>
              run(`${actionKey}-review`, async () => {
                try {
                  await startReviewingJob(job.id);
                  router.refresh();
                  toast({
                    title: "Marked reviewing",
                    description: "Added to your application pipeline.",
                  });
                } catch (e) {
                  toast({
                    title: "Failed",
                    description: e instanceof Error ? e.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            Review
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10"
            loading={isKeyPending(`${actionKey}-dismiss`)}
            onClick={() =>
              run(`${actionKey}-dismiss`, async () => {
                try {
                  await dismissJob(job.id);
                  router.refresh();
                  toast({ title: "Job dismissed" });
                } catch (e) {
                  toast({
                    title: "Failed",
                    description: e instanceof Error ? e.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            Dismiss
          </Button>
          {compare ? (
            <Button
              variant={inCompare ? "secondary" : "outline"}
              size="sm"
              className="min-h-10"
              aria-pressed={inCompare}
              aria-label={inCompare ? `Remove ${subject} from compare` : `Add ${subject} to compare`}
              onClick={() => toggleCompare(compare, job.id)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
                {inCompare ? "Comparing" : "Compare"}
              </span>
            </Button>
          ) : null}
          <JobDeleteButton
            jobId={job.id}
            jobTitle={job.title}
            onDeletingChange={setDeleting}
          />
        </div>
      </CardContent>
    </Card>
  );
}
