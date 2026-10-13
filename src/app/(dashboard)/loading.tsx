import { JobsFeedSkeleton } from "@/components/jobs/jobs-feed-skeleton";

export default function DashboardLoading() {
  return <JobsFeedSkeleton message="Loading…" rows={4} />;
}
