"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { rematchJobAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

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
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isStale && (
        <Badge className="bg-amber-100 text-amber-900">
          Profile updated since last analysis
        </Badge>
      )}
      {hasAnalysis && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await rematchJobAction(jobId);
                toast({ title: "Match analysis updated" });
                router.refresh();
              } catch (e) {
                toast({
                  title: "Re-run failed",
                  description: e instanceof Error ? e.message : "Unknown error",
                  variant: "destructive",
                });
              }
            })
          }
        >
          {isPending ? "Re-running..." : "Re-run analysis"}
        </Button>
      )}
    </div>
  );
}
