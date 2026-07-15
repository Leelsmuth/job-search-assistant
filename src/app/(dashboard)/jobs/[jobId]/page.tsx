import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getJobDetail,
  getApplicationForJobAction,
  getTailoringSuggestions,
  getApplicationAnswers,
  getOrCreateProfile,
} from "@/server/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { classificationColor, formatSalary, humanizeMatchStatus } from "@/lib/utils";
import type { MatchClassification } from "@/lib/utils";
import { resolveDisplayTitle } from "@/modules/ingestion/html-text";
import { isAnalysisStale } from "@/modules/matching/stale";
import { isSparseExtraction } from "@/modules/matching/engine";
import { JobDescription } from "@/components/jobs/job-description";
import { JobActions } from "./job-actions";
import { TailoringPanel } from "./tailoring-panel";
import { ApplicationQAPanel } from "./application-qa-panel";
import { MatchTabActions } from "./match-tab-actions";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = await getJobDetail(jobId);
  if (!job) notFound();

  const [application, tailoringSuggestions, profile] = await Promise.all([
    getApplicationForJobAction(jobId),
    getTailoringSuggestions(jobId),
    getOrCreateProfile(),
  ]);

  const savedAnswers = await getApplicationAnswers(application?.id ?? null);

  const match = job.matchAnalyses[0];
  const classification = match?.classification as MatchClassification | undefined;
  const displayTitle = resolveDisplayTitle(job.title, job.description ?? "");
  const hardFilter = match?.hardFilterResult as
    | { warnings?: string[]; blocks?: string[] }
    | undefined;
  const isStale = match
    ? isAnalysisStale(match.createdAt, profile.updatedAt)
    : false;
  const sparseExtraction = isSparseExtraction(
    job.requirements.map((r) => ({
      id: r.id,
      requirementType: r.requirementType,
      text: r.text,
      normalizedSkill: r.normalizedSkill,
      importance: r.importance ?? "required",
      isHardRequirement: false,
    }))
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/jobs">← Back to feed</Link>
          </Button>
          <h1 className="mt-2 text-2xl font-bold">{displayTitle}</h1>
          <p className="text-muted-foreground">
            {job.company?.name} · {job.location} · {job.workplaceType}
          </p>
          {job.jobUrl && (
            <a
              href={job.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View original posting
            </a>
          )}
        </div>
        <div className="text-right">
          {match && (
            <>
              <div className="text-3xl font-bold">{Math.round(match.overallScore)}%</div>
              {classification && (
                <Badge className={classificationColor(classification)}>
                  {classification}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      <JobActions jobId={job.id} isSaved={job.isSaved} />

      <Tabs defaultValue="match">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="match">Match</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="tailoring">Tailoring</TabsTrigger>
          <TabsTrigger value="application">Application Q&A</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <strong>Salary:</strong>{" "}
                {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency ?? "CAD") ??
                  "Not listed"}
              </p>
              <p>
                <strong>Technologies:</strong>{" "}
                {(job.technologies as string[])?.join(", ") || "—"}
              </p>
              <JobDescription text={job.description ?? ""} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="match" className="space-y-4">
          <MatchTabActions jobId={job.id} isStale={isStale} hasAnalysis={Boolean(match)} />
          {match ? (
            <>
              {sparseExtraction && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="p-4 text-sm text-amber-900">
                    <strong>Limited requirement extraction:</strong> Few requirements were
                    parsed from this posting. Match score may be unreliable — review the
                    evidence tab manually.
                  </CardContent>
                </Card>
              )}
              <p className="text-sm">{match.summary}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {match.categoryScores?.map((cs) => (
                  <Card key={cs.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{cs.category.replace(/_/g, " ")}</span>
                        <span>
                          {Math.round(cs.score)}/{Math.round(cs.maxScore)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{cs.explanation}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {hardFilter?.warnings?.length ? (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="p-4 text-sm text-amber-900">
                    <strong>Warnings:</strong> {hardFilter.warnings.join("; ")}
                  </CardContent>
                </Card>
              ) : null}
              {hardFilter?.blocks?.length ? (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="p-4 text-sm text-red-800">
                    <strong>Blockers:</strong> {hardFilter.blocks.join("; ")}
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">No match analysis yet.</p>
          )}
        </TabsContent>

        <TabsContent value="evidence" className="space-y-3">
          {match?.requirementMatches?.map((rm) => (
            <Card key={rm.id}>
              <CardContent className="grid gap-4 p-4 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Job requirement
                  </p>
                  <p className="font-medium">{rm.requirement?.text ?? "Unknown requirement"}</p>
                  <div className="flex flex-wrap gap-2">
                    {rm.requirement?.requirementType && (
                      <Badge className="border border-border bg-transparent">
                        {rm.requirement.requirementType}
                      </Badge>
                    )}
                    {rm.requirement?.importance && (
                      <Badge className="border border-border bg-transparent">
                        {rm.requirement.importance}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Your evidence
                    </p>
                    <Badge
                      className={
                        rm.matchStatus === "confirmed"
                          ? "bg-emerald-100 text-emerald-800"
                          : rm.matchStatus === "gap" || rm.matchStatus === "blocked"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }
                    >
                      {humanizeMatchStatus(rm.matchStatus)}
                    </Badge>
                    {rm.confidence != null && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(rm.confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  {rm.evidence?.evidenceText ? (
                    <p className="rounded-md border border-border bg-muted/30 p-2">
                      {rm.evidence.evidenceText}
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic">No evidence linked</p>
                  )}
                  {rm.explanation && (
                    <p className="text-xs text-muted-foreground">{rm.explanation}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {!match?.requirementMatches?.length && (
            <p className="text-sm text-muted-foreground">No requirement matches yet.</p>
          )}
        </TabsContent>

        <TabsContent value="tailoring">
          <TailoringPanel jobId={job.id} initialSuggestions={tailoringSuggestions} />
        </TabsContent>

        <TabsContent value="application">
          <ApplicationQAPanel
            jobId={job.id}
            applicationId={application?.id}
            initialAnswers={savedAnswers}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
