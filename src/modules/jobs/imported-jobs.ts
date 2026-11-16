import { sql, type SQL } from "drizzle-orm";
import { jobs } from "@/db/schema";

/**
 * Jobs created by a spreadsheet import are tracker records, not discoveries:
 * often months old, often already rejected. They are marked with this
 * match_pipeline_status so the job feed, the daily digest, job counts, and
 * rescoring leave them out, and the match queue (which only takes
 * "match_pending") never scores them.
 *
 * Discovery can still take one over: when a board later finds the same
 * posting, persistDiscoveredJob replaces its details and sets it back to
 * "match_pending", and from then on it is a live, discovered job.
 */
export const IMPORTED_JOB_PIPELINE_STATUS = "imported";

export function isImportedJob(job: { matchPipelineStatus: string | null }): boolean {
  return job.matchPipelineStatus === IMPORTED_JOB_PIPELINE_STATUS;
}

/** SQL condition for "not an imported job". NULL-safe: a plain <> would drop jobs with no status. */
export function notImportedJob(): SQL {
  return sql`${jobs.matchPipelineStatus} IS DISTINCT FROM ${IMPORTED_JOB_PIPELINE_STATUS}`;
}
