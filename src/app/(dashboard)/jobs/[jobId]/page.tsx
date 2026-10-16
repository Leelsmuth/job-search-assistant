import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobDetailPageData } from "@/server/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatSalary, humanizeMatchStatus } from "@/lib/utils";
import { resolveDisplayTitle } from "@/modules/ingestion/html-text";
import { computeExtractionQuality } from "@/modules/ingestion/extract-requirements";
import { isAnalysisStale } from "@/modules/matching/stale";
import { isSparseExtraction } from "@/modules/matching/engine";
import { groupRequirementMatches } from "@/modules/matching/group-matches";
import { JobDescription } from "@/components/jobs/job-description";
import { JobActions } from "./job-actions";
import { DocumentsPanel } from "./documents-panel";
import { LazyTailoringPanel } from "./lazy-tailoring-panel";
import { LazyApplicationQAPanel } from "./lazy-application-qa-panel";
import { MatchTabActions } from "./match-tab-actions";
import { MatchHistoryPanel } from "@/components/jobs/match-history-panel";
import { FrontendFitCard } from "@/components/jobs/frontend-fit-card";
import { ResumeMatchPanel } from "@/components/jobs/resume-match-panel";
import { ResumeScoreBadge } from "@/components/jobs/resume-score-badge";
import { isOpenAiConfigured } from "@/lib/env";
import { JobSourceBadge } from "@/components/jobs/job-source-badge";
import { sourceCredit } from "@/modules/discovery/source-catalog";
import { postingAgeClass, postingAgeLabel } from "@/modules/jobs/posting-age";

function MatchGroupSection({
  title,
  items,
}: {
  title: string;
  items: Array<{
    id: string;
    explanation: string | null;
    requirement?: { text?: string | null } | null;
  }>;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <p className="text-sm font-medium">{item.requirement?.text ?? "Requirement"}</p>
            {item.explanation && (
              <p className="mt-1 text-xs text-muted-foreground">{item.explanation}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { jobId } = await params;
  const { tab } = await searchParams;
  const pageData = await getJobDetailPageData(jobId);
  if (!pageData) notFound();

  const { job, application, profileUpdatedAt, matchHistory, frontendFit, location, resumeMatch } = pageData;

  const match = job.matchAnalyses[0];
  const credit = sourceCredit(job.source?.provider);
  const displayTitle = resolveDisplayTitle(job.title, job.description ?? "");
  const hardFilter = match?.hardFilterResult as
    | { warnings?: string[]; blocks?: string[] }
    | undefined;
  const isStale = match
    ? isAnalysisStale(match.createdAt, profileUpdatedAt)
    : false;
  const requirementInputs = job.requirements.map((r) => ({
    id: r.id,
    requirementType: r.requirementType,
    text: r.text,
    normalizedSkill: r.normalizedSkill,
    importance: r.importance ?? "required",
    isHardRequirement: false,
  }));
  const sparseExtraction = isSparseExtraction(requirementInputs);
  const extractionQuality = computeExtractionQuality(job.requirements);
  const groupedMatches = groupRequirementMatches(match?.requirementMatches ?? []);
  const age = postingAgeLabel({
    postedAt: job.postedAt,
    postedAtSource: job.postedAtSource,
    dateDiscovered: job.dateDiscovered,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 min-h-10">
          <Link href="/jobs">← Back to feed</Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">{displayTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {job.company?.name} · {job.location} · {job.workplaceType}
            </p>
            <p className={`mt-1 text-sm font-medium ${postingAgeClass(age.tone)}`}>{age.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <JobSourceBadge provider={job.source?.provider} />
              {credit ? <span className="text-xs text-muted-foreground">{credit.applyNote}</span> : null}
            </div>
            {job.jobUrl && (
              <a
                href={job.jobUrl}
                target="_blank"
                rel={credit ? "noopener" : "noopener noreferrer"}
                className="mt-2 inline-block min-h-10 py-2 text-sm text-blue-600 hover:underline"
              >
                View original posting
              </a>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 text-right">
            <div className="text-3xl font-bold leading-none">{frontendFit.score}</div>
            <span className="text-xs text-muted-foreground">fit</span>
            {resumeMatch ? (
              <>
                <div className="text-xl font-bold leading-none">{resumeMatch.score.overall}</div>
                <span className="text-xs text-muted-foreground">ATS</span>
                <ResumeScoreBadge score={resumeMatch.score.overall} />
              </>
            ) : null}
            {frontendFit.eligible === false ? (
              <Badge className="bg-amber-100 text-amber-900">Ineligible</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <ResumeMatchPanel jobId={job.id} initial={resumeMatch} />

      <FrontendFitCard
        jobId={job.id}
        fit={frontendFit}
        location={location}
        aiAvailable={isOpenAiConfigured()}
      />

      <JobActions
        jobId={job.id}
        jobTitle={job.title}
        jobUrl={job.jobUrl}
        isSaved={job.isSaved}
        isAlreadyApplied={application?.status === "applied"}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href={`/jobs/${job.id}?tab=documents`}>Tailor resume</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/jobs/${job.id}/apply`}>Prepare application</Link>
        </Button>
      </div>

      <Tabs defaultValue={tab === "documents" ? "documents" : "match"}>
        <TabsList className="mb-2 w-full sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="match">Match</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="tailoring">Tailor</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="application">Q&amp;A</TabsTrigger>
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
          <MatchHistoryPanel
            analyses={matchHistory}
            profileUpdatedAt={profileUpdatedAt ?? new Date()}
          />
          {match ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-border bg-transparent">
                  Extraction confidence: {extractionQuality.confidence}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {extractionQuality.requirementCount} requirements ·{" "}
                  {extractionQuality.skillCount} skills detected
                </span>
              </div>
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
              <MatchGroupSection title="Strong matches" items={groupedMatches.strong} />
              <MatchGroupSection title="Partial matches" items={groupedMatches.partial} />
              <MatchGroupSection title="Gaps" items={groupedMatches.gaps} />
              <MatchGroupSection title="Blockers" items={groupedMatches.blockers} />
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
                <div className="space-y-2 border-t border-border pt-4 text-sm md:border-0 md:pt-0">
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
          <LazyTailoringPanel jobId={job.id} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel jobId={job.id} />
        </TabsContent>

        <TabsContent value="application">
          <LazyApplicationQAPanel jobId={job.id} applicationId={application?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
