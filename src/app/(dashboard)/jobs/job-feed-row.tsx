"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { classificationColor, formatSalary, formatMatchScore } from "@/lib/utils";
import type { MatchClassification } from "@/lib/utils";
import { cn } from "@/lib/utils";
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
  const [deleting, setDeleting] = useState(false);
  const match = job.matchAnalyses[0];

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
              {job.isSaved && (
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
        <JobDeleteButton
          jobId={job.id}
          jobTitle={job.title}
          onDeletingChange={setDeleting}
        />
      </CardContent>
    </Card>
  );
}
