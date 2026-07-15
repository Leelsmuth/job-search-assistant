"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteJob } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { usePendingTransition } from "@/components/layout/action-pending-provider";

export function JobDeleteButton({
  jobId,
  jobTitle,
  redirectTo,
  size = "sm",
  showLabel = false,
  onDeletingChange,
}: {
  jobId: string;
  jobTitle: string;
  redirectTo?: string;
  size?: "sm" | "default";
  showLabel?: boolean;
  onDeletingChange?: (deleting: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { isPending, run } = usePendingTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      loading={isPending}
      className="shrink-0 text-muted-foreground hover:text-destructive"
      aria-label={isPending ? `Deleting ${jobTitle}` : `Delete ${jobTitle}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const confirmed = window.confirm(
          `Delete "${jobTitle}"? This removes the job, match analysis, and any linked application data.`
        );
        if (!confirmed) return;

        onDeletingChange?.(true);
        run(async () => {
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
          } finally {
            onDeletingChange?.(false);
          }
        });
      }}
    >
      {!isPending ? <Trash2 className="h-4 w-4" /> : null}
      {showLabel ? (
        <span>{isPending ? "Deleting..." : "Delete"}</span>
      ) : isPending ? (
        <span className="sr-only">Deleting...</span>
      ) : null}
    </Button>
  );
}
