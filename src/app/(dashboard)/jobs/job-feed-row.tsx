"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  toggleSaveJob,
  dismissJob,
  startReviewingJob,
} from "@/server/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { classificationColor, formatSalary, formatMatchScore } from "@/lib/utils";
import type { MatchClassification } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import { JobDeleteButton } from "./job-delete-button";

type FeedJob = {
  id: string;
  title: string;
  location: string | null;
  workplaceType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  isSaved: boolean;
  company: { name: string } | null;
  matchAnalyses: Array<{
    overallScore: number | null;
    classification: string;
    topConcern: string | null;
    topMatchingSkills: unknown;
  }>;
};

export function JobFeedRow({
  job,
  classification,
  isStale,
  lowExtraction,
  isNew,
}: {
  job: FeedJob;
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
  const match = job.matchAnalyses[0];
  const actionKey = `feed-${job.id}`;

  return (
    <Card
      className={cn(
        "transition-colors hover:bg-accent/50",
        deleting && "pointer-events-none opacity-60"
      )}
      aria-busy={deleting}
    >
      <CardContent className="flex items-center gap-2 p-4">
        <Link href={`/jobs/${job.id}`} className="flex min-w-0 flex-1 items-center gap-4">
          <div className="w-14 shrink-0 text-center">
            <div className="text-xl font-bold">
              {formatMatchScore(match?.overallScore ?? null)}
            </div>
            <div className="text-xs text-muted-foreground">match</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{job.title}</h3>
              {classification && (
                <Badge className={classificationColor(classification)}>{classification}</Badge>
              )}
              {saved && (
                <Badge className="border border-blue-300 bg-transparent text-blue-700">saved</Badge>
              )}
              {isNew && <Badge className="bg-green-100 text-green-900">new</Badge>}
              {isStale && <Badge className="bg-amber-100 text-amber-900">stale</Badge>}
              {lowExtraction && (
                <Badge className="border border-amber-300 bg-transparent text-amber-800">
                  low extraction
                </Badge>
              )}
              {deleting ? (
                <Badge className="bg-muted text-muted-foreground">Deleting...</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {job.company?.name ?? "Unknown"} · {job.location ?? "—"} · {job.workplaceType ?? "—"}
            </p>
            {match?.topConcern && (
              <p className="mt-1 truncate text-xs text-orange-700">Gap: {match.topConcern}</p>
            )}
          </div>
          <div className="hidden shrink-0 text-right text-sm text-muted-foreground md:block">
            <div>
              {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency ?? "CAD") ?? "—"}
            </div>
            <div className="text-xs">
              {(match?.topMatchingSkills as string[] | undefined)?.slice(0, 2).join(", ")}
            </div>
          </div>
        </Link>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            variant={saved ? "secondary" : "outline"}
            size="sm"
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
        </div>
        <JobDeleteButton
          jobId={job.id}
          jobTitle={job.title}
          onDeletingChange={setDeleting}
        />
      </CardContent>
    </Card>
  );
}
