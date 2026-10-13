import { JobsFeedSkeleton } from "@/components/jobs/jobs-feed-skeleton";

export default function JobsLoading() {
  return <JobsFeedSkeleton message="Loading your jobs…" />;
}
