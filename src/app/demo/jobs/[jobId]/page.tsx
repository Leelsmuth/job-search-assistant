import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { classificationColor, formatSalary } from "@/lib/utils";
import { LOCATION_CLASS_LABELS } from "@/modules/location/eligibility";
import { formatWorkLocation } from "@/modules/applications/tracker";
import { DEMO_JOBS, getDemoJob } from "@/modules/demo/sample-jobs";
import { DEMO_FEED_HREF } from "../../demo-links";
import { DemoJobTrackerPanel } from "./demo-job-tracker-panel";

export const dynamicParams = false;

export function generateStaticParams() {
  return DEMO_JOBS.map((job) => ({ jobId: job.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getDemoJob(jobId);
  return { title: job ? `${job.title} · Demo` : "Demo job" };
}

export default async function DemoJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getDemoJob(jobId);
  if (!job) notFound();

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);

  return (
    <div className="space-y-6">
      <Link
        href={DEMO_FEED_HREF}
        className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to job feed
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-xl font-bold sm:text-2xl">{job.title}</h1>
          <p className="text-muted-foreground">
            {job.company} · {formatWorkLocation(job.location, job.workplaceType)}
            {salary ? ` · ${salary}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge className="border border-border bg-transparent">
              {LOCATION_CLASS_LABELS[job.locationClass]}
            </Badge>
            {job.locationFlags.includes("us_work_authorization") ? (
              <Badge className="bg-amber-100 text-amber-900">US auth</Badge>
            ) : null}
            <Badge className={classificationColor(job.classification)}>{job.classification}</Badge>
            <Badge className="border border-border bg-transparent">via {job.sourceLabel}</Badge>
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-border px-4 py-2 text-center">
          <div className="text-2xl font-bold">{job.fitScore}</div>
          <div className="text-xs text-muted-foreground">fit score</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Why it matches</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="list-disc space-y-1 pl-5">
                {job.fitReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {job.topConcern ? (
                <p className="text-orange-700">
                  <span className="font-medium">Gap:</span> {job.topConcern}
                </p>
              ) : (
                <p className="text-muted-foreground">No gaps found against the sample profile.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Matching skills: {job.matchingSkills.join(", ")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">About the role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>{job.summary}</p>
              <Section title="What you'll do" items={job.responsibilities} />
              <Section title="Requirements" items={job.requirements} />
              <Section title="Nice to have" items={job.niceToHave} />
              <div className="flex flex-wrap gap-1.5">
                {job.technologies.map((tech) => (
                  <Badge key={tech} className="border-border bg-muted font-medium">
                    {tech}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside aria-label="Tracker" className="lg:sticky lg:top-36 lg:self-start">
          <DemoJobTrackerPanel jobId={job.id} title={job.title} company={job.company} />
        </aside>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="mb-1 font-medium">{title}</h2>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
