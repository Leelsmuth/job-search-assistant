import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function JobDetailLoading() {
  return (
    <div
      className="mx-auto max-w-4xl space-y-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-4/5 max-w-lg" />
      <Skeleton className="h-4 w-3/5 max-w-sm" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Skeleton className="h-10 w-20 shrink-0" />
        <Skeleton className="h-10 w-24 shrink-0" />
        <Skeleton className="h-10 w-28 shrink-0" />
        <Skeleton className="h-10 w-24 shrink-0" />
      </div>
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
