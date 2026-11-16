export const DEMO_FEED_HREF = "/demo";
export const DEMO_TRACKER_HREF = "/demo/applications";

export function demoJobHref(jobId: string): string {
  return `/demo/jobs/${encodeURIComponent(jobId)}`;
}
