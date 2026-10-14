import { Skeleton } from "@/components/ui/skeleton";

export default function DigestLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading digest</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
