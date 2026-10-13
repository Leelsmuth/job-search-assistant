import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ApplicationCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-6 w-12" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export default function ApplicationsLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 sm:w-20" />
          <Skeleton className="h-10 flex-1 sm:w-24" />
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <ApplicationCardSkeleton key={index} />
        ))}
      </div>
      <Skeleton className="hidden h-64 w-full md:block" />
    </div>
  );
}
