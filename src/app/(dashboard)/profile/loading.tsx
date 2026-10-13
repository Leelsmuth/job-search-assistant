import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" role="status" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
