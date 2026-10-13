import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

function JobFeedRowSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="w-12 shrink-0 space-y-1 text-center sm:w-14">
            <Skeleton className="mx-auto h-7 w-10" />
            <Skeleton className="mx-auto h-3 w-8" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-5 w-4/5 max-w-xs" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-3/5 max-w-sm" />
            <Skeleton className="h-3 w-2/5 max-w-[10rem] sm:hidden" />
            <Skeleton className="hidden h-3 w-4/5 sm:block" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3 sm:border-0 sm:pt-0">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function JobsFeedSkeleton({
  message = "Loading your jobs…",
  rows = 6,
}: {
  message?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-28 sm:h-8 sm:w-32" />
          <Skeleton className="h-4 w-44 sm:w-52" />
        </div>
        <Skeleton className="h-11 w-full sm:h-9 sm:w-28" />
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm font-medium">
        <Spinner className="h-5 w-5 shrink-0" />
        <span>{message}</span>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full sm:max-w-md" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <JobFeedRowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
