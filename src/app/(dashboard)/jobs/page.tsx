import Link from "next/link";
import { getJobsFeed } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MatchClassification } from "@/lib/utils";
import { JobsFeedFilters } from "./jobs-feed-filters";
import { JobFeedRow } from "./job-feed-row";
import { isAnalysisStale } from "@/modules/matching/stale";
import { computeExtractionQuality } from "@/modules/ingestion/extract-requirements";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    minScore?: string;
    remote?: string;
    canada?: string;
    classification?: string;
    source?: string;
    sort?: string;
    search?: string;
    discoveredSince?: "24h" | "7d";
    strongUnseen?: string;
  }>;
}) {
  const params = await searchParams;
  const sort = (params.sort as "match" | "recent" | "salary") ?? "match";

  const feedFilters = {
    minScore: params.minScore ? Number(params.minScore) : undefined,
    remoteOnly: params.remote === "true",
    canadaOnly: params.canada === "true",
    classification: params.classification,
    source: params.source as "discovered" | "manual" | undefined,
    sort,
    search: params.search,
    discoveredSince: params.discoveredSince,
    strongUnseenOnly: params.strongUnseen === "true",
  };

  const allFeed = await getJobsFeed({ sort });
  const filteredFeed = await getJobsFeed(feedFilters);

  const allJobs = allFeed.jobs;
  const jobs = filteredFeed.jobs;
  const profileUpdatedAt = filteredFeed.profileUpdatedAt;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Job Feed</h1>
          <p className="text-sm text-muted-foreground">
            {jobs.length} roles — scan matches and gaps quickly
          </p>
        </div>
        <Button asChild>
          <Link href="/jobs/import">Import Job</Link>
        </Button>
      </div>

      <JobsFeedFilters />

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {allJobs.length === 0 ? (
              <>
                <p className="text-muted-foreground">No jobs yet.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href="/jobs/import">Import your first job</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/discovery">Browse company boards</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">No jobs match your filters.</p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/jobs">Clear filters</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const match = job.matchAnalyses[0];
            const classification = match?.classification as MatchClassification | undefined;
            const extractionQuality = computeExtractionQuality(job.requirements ?? []);
            const isStale = match
              ? isAnalysisStale(match.createdAt, profileUpdatedAt)
              : false;
            const lowExtraction = extractionQuality.confidence === "low";
            const isNew =
              Date.now() - new Date(job.dateDiscovered).getTime() < 24 * 60 * 60 * 1000;

            return (
              <JobFeedRow
                key={job.id}
                job={job}
                classification={classification}
                isStale={isStale}
                lowExtraction={lowExtraction}
                isNew={isNew}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
