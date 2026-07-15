"use client";

import { useTransition } from "react";
import { toggleSaveJob } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export function JobActions({
  jobId,
  isSaved,
}: {
  jobId: string;
  isSaved: boolean;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
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
  );
}
