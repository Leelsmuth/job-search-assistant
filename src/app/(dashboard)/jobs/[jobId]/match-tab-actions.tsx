"use client";

import { useRouter } from "next/navigation";
import { rematchJobAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { usePendingTransition } from "@/components/layout/action-pending-provider";

export function MatchTabActions({
  jobId,
  isStale,
  hasAnalysis,
}: {
  jobId: string;
  isStale: boolean;
  hasAnalysis: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { isPending, run } = usePendingTransition();

  function runAnalysis() {
    run(async () => {
      try {
        await rematchJobAction(jobId);
        toast({
          title: hasAnalysis ? "Match analysis updated" : "Match analysis complete",
        });
        router.refresh();
      } catch (e) {
        toast({
          title: "Analysis failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isStale && (
        <Badge className="bg-amber-100 text-amber-900">
          Profile updated since last analysis
        </Badge>
      )}
      <Button
        size="sm"
        variant="outline"
        loading={isPending}
        onClick={runAnalysis}
      >
        {isPending
          ? hasAnalysis
            ? "Re-running..."
            : "Running..."
          : hasAnalysis
            ? "Re-run analysis"
            : "Run analysis"}
      </Button>
    </div>
  );
}
