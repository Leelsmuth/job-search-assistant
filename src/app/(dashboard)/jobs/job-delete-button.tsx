"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteJob } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export function JobDeleteButton({
  jobId,
  jobTitle,
  redirectTo,
  size = "sm",
  showLabel = false,
}: {
  jobId: string;
  jobTitle: string;
  redirectTo?: string;
  size?: "sm" | "default";
  showLabel?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      disabled={isPending}
      className="shrink-0 text-muted-foreground hover:text-destructive"
      aria-label={`Delete ${jobTitle}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const confirmed = window.confirm(
          `Delete "${jobTitle}"? This removes the job, match analysis, and any linked application data.`
        );
        if (!confirmed) return;

        startTransition(async () => {
          try {
            await deleteJob(jobId);
            toast({ title: "Job deleted", description: jobTitle });
            if (redirectTo) {
              router.push(redirectTo);
            } else {
              router.refresh();
            }
          } catch (err) {
            toast({
              title: "Delete failed",
              description: err instanceof Error ? err.message : "Unknown error",
              variant: "destructive",
            });
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
      {showLabel ? <span className="ml-2">Delete</span> : null}
    </Button>
  );
}
