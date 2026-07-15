import Link from "next/link";
import { getJobsFeed } from "@/server/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { classificationColor, formatSalary, formatMatchScore } from "@/lib/utils";
import type { MatchClassification } from "@/lib/utils";
import { JobsFeedFilters } from "./jobs-feed-filters";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    minScore?: string;
    remote?: string;
    canada?: string;
    classification?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;

  const allJobs = await getJobsFeed({
    sort: (params.sort as "match" | "recent" | "salary") ?? "match",
  });

  const jobs = await getJobsFeed({
    minScore: params.minScore ? Number(params.minScore) : undefined,
    remoteOnly: params.remote === "true",
    canadaOnly: params.canada === "true",
    classification: params.classification,
    sort: (params.sort as "match" | "recent" | "salary") ?? "match",
  });

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
                <Button asChild className="mt-4">
                  <Link href="/jobs/import">Import your first job</Link>
                </Button>
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
            return (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="w-14 text-center">
                      <div className="text-xl font-bold">
                        {formatMatchScore(match?.overallScore ?? null)}
                      </div>
                      <div className="text-xs text-muted-foreground">match</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">{job.title}</h3>
                        {classification && (
                          <Badge className={classificationColor(classification)}>
                            {classification}
                          </Badge>
                        )}
                        {job.isSaved && (
                          <Badge className="border border-blue-300 bg-transparent text-blue-700">
                            saved
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {job.company?.name ?? "Unknown"} · {job.location ?? "—"} ·{" "}
                        {job.workplaceType ?? "—"}
                      </p>
                      {match?.topConcern && (
                        <p className="mt-1 truncate text-xs text-orange-700">
                          Gap: {match.topConcern}
                        </p>
                      )}
                    </div>
                    <div className="hidden text-right text-sm text-muted-foreground md:block">
                      <div>{formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency ?? "CAD") ?? "—"}</div>
                      <div className="text-xs">
                        {(match?.topMatchingSkills as string[] | undefined)?.slice(0, 2).join(", ")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
