"use client";

import { useTransition } from "react";
import { toggleSaveJob } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { JobDeleteButton } from "../job-delete-button";

export function JobActions({
  jobId,
  jobTitle,
  isSaved,
}: {
  jobId: string;
  jobTitle: string;
  isSaved: boolean;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={isSaved ? "secondary" : "outline"}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
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
        {isSaved ? "Saved" : "Save Job"}
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
