"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  ApplicationControls,
  AttentionBadges,
} from "@/app/(dashboard)/applications/application-controls";
import { getDemoTrackedApplicationForJob } from "@/modules/demo/demo-state";
import { demoActions, useDemoState } from "../../demo-store";
import { DEMO_TRACKER_HREF } from "../../demo-links";

export function DemoJobTrackerPanel({
  jobId,
  title,
  company,
}: {
  jobId: string;
  title: string;
  company: string;
}) {
  const state = useDemoState();
  const { toast } = useToast();

  if (!state) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4" aria-busy="true">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isSaved = state.savedJobIds.includes(jobId);
  const tracked = getDemoTrackedApplicationForJob(state, jobId);
  const subject = `${title} at ${company}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Application</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant={isSaved ? "secondary" : "default"}
          className="min-h-10 w-full"
          aria-pressed={isSaved}
          aria-label={isSaved ? `Unsave ${subject}` : `Save ${subject}`}
          onClick={() => {
            if (isSaved) {
              demoActions.unsaveJob(jobId);
              toast({ title: "Unsaved" });
            } else {
              demoActions.saveJob(jobId);
              toast({
                title: "Job saved",
                description: tracked ? undefined : "Added to your applications as Saved.",
              });
            }
          }}
        >
          {isSaved ? "Saved" : "Save job"}
        </Button>

        {tracked ? (
          <div className="space-y-3 border-t border-border pt-4">
            <AttentionBadges flags={tracked.attention} />
            <ApplicationControls
              key={`${tracked.id}:${tracked.status}:${tracked.notes ?? ""}:${tracked.followUpDate ?? ""}:${tracked.dateApplied ?? ""}`}
              application={tracked}
              showAppliedDate
              idPrefix="detail"
            />
            <Link
              href={DEMO_TRACKER_HREF}
              className="inline-flex min-h-10 items-center text-sm text-blue-600 hover:underline"
            >
              Open the tracker
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Save this job to add it to your tracker, then move it through applied, interviewing,
            and offer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
