"use client";

import { toggleSaveJob } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { JobDeleteButton } from "../job-delete-button";
import { usePendingTransition } from "@/components/layout/action-pending-provider";
import { ApplyLink } from "@/components/jobs/apply-link";

export function JobActions({
  jobId,
  jobTitle,
  jobUrl,
  isSaved,
  isAlreadyApplied = false,
}: {
  jobId: string;
  jobTitle: string;
  jobUrl?: string | null;
  isSaved: boolean;
  isAlreadyApplied?: boolean;
}) {
  const { toast } = useToast();
  const { isPending, run } = usePendingTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <ApplyLink
        jobId={jobId}
        jobUrl={jobUrl}
        size="default"
        isAlreadyApplied={isAlreadyApplied}
      />
      <Button
        variant={isSaved ? "secondary" : "outline"}
        loading={isPending}
        onClick={() =>
          run(async () => {
            try {
              await toggleSaveJob(jobId, !isSaved);
              toast({ title: isSaved ? "Job unsaved" : "Job saved" });
            } catch (err) {
              toast({
                title: "Update failed",
                description: err instanceof Error ? err.message : "Unknown error",
                variant: "destructive",
              });
            }
          })
        }
      >
        {isPending ? "Saving..." : isSaved ? "Saved" : "Save Job"}
      </Button>
      <JobDeleteButton
        jobId={jobId}
        jobTitle={jobTitle}
        redirectTo="/jobs"
        size="default"
        showLabel
      />
    </div>
  );
}
