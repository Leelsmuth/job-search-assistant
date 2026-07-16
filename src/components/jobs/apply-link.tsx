"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { markJobAsApplied, prepareJobApplication } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import { cn } from "@/lib/utils";

type ApplyLinkProps = {
  jobId: string;
  jobUrl?: string | null;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  showIcon?: boolean;
  isAlreadyApplied?: boolean;
};

function openApplicationPage(jobUrl: string) {
  window.open(jobUrl, "_blank", "noopener,noreferrer");
}

function useApplyClickHandler(
  jobId: string,
  jobUrl: string,
  isAlreadyApplied = false
) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const pendingKey = `apply-${jobId}`;

  function showApplyConfirmationToast() {
    if (isAlreadyApplied) {
      toast({
        title: "Application page opened",
        description: "This role is already in your applied jobs.",
        durationMs: 10_000,
      });
      return;
    }

    toast({
      title: "Did you apply?",
      description: "Mark this job as applied once you've submitted your application.",
      durationMs: 30_000,
      action: {
        label: "Mark as applied",
        onClick: async () => {
          try {
            const result = await markJobAsApplied(jobId);
            router.refresh();
            toast({
              title: result.alreadyApplied ? "Already applied" : "Marked as applied",
              description: "Find it under Applications → Applied.",
            });
          } catch (e) {
            toast({
              title: "Could not mark as applied",
              description: e instanceof Error ? e.message : "Unknown error",
              variant: "destructive",
            });
          }
        },
      },
    });
  }

  function handleApplyClick() {
    showApplyConfirmationToast();
    openApplicationPage(jobUrl);

    run(pendingKey, async () => {
      try {
        await prepareJobApplication(jobId);
        router.refresh();
      } catch (e) {
        toast({
          title: "Could not update tracker",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return { handleApplyClick, isPending: isKeyPending(pendingKey) };
}

export function ApplyLink({
  jobId,
  jobUrl,
  size = "sm",
  variant = "default",
  className,
  showIcon = true,
  isAlreadyApplied = false,
}: ApplyLinkProps) {
  const { handleApplyClick, isPending } = useApplyClickHandler(
    jobId,
    jobUrl ?? "",
    isAlreadyApplied
  );
  if (!jobUrl) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      loading={isPending}
      onClick={handleApplyClick}
    >
      Apply
      {showIcon ? <ExternalLink className="ml-1 h-3 w-3" /> : null}
    </Button>
  );
}

export function ApplyTextLink({
  jobId,
  jobUrl,
  className,
  isAlreadyApplied = false,
}: {
  jobId: string;
  jobUrl?: string | null;
  className?: string;
  isAlreadyApplied?: boolean;
}) {
  const { handleApplyClick, isPending } = useApplyClickHandler(
    jobId,
    jobUrl ?? "",
    isAlreadyApplied
  );
  if (!jobUrl) return null;

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleApplyClick}
      className={cn(
        "inline-flex items-center gap-1 text-sm text-blue-600 hover:underline disabled:opacity-50",
        className
      )}
    >
      Apply
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}
