import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrackedApplication } from "@/server/actions/application-tracker-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationControls, AttentionBadges } from "../application-controls";
import {
  assistedApplyAnswers,
  describeEvent,
  formatDisplayDate,
  formatDisplayDateTime,
  statusLabel,
} from "@/modules/applications/tracker";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const application = await getTrackedApplication(applicationId);
  if (!application) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/applications" className="inline-flex min-h-10 items-center text-sm text-blue-600 hover:underline">
          Back to applications
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">{application.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {application.companyName} · {application.locationLabel}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {application.jobUrl ? (
            <a
              href={application.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Job posting
            </a>
          ) : (
            <span className="text-muted-foreground">No job link</span>
          )}
          <Link href={`/jobs/${application.jobId}`} className="text-muted-foreground hover:underline">
            View job
          </Link>
        </div>
        <div className="mt-3">
          <AttentionBadges flags={application.attention} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Stage</dt>
                <dd>{statusLabel(application.stage)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Last activity</dt>
                <dd>
                  <time dateTime={application.lastActivityAt}>
                    {formatDisplayDateTime(application.lastActivityAt)}
                  </time>
                </dd>
              </div>
            </dl>
            <ApplicationControls
              key={`${application.id}:${application.status}:${application.notes ?? ""}:${application.followUpDate ?? ""}:${application.dateApplied ?? ""}`}
              application={application}
              notesMode="inline"
              showAppliedDate
            />
          </CardContent>
        </Card>

        <section aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="mb-3 text-base font-semibold">
            Activity
          </h2>
          {application.events.length === 0 ? (
            <p className="rounded-lg border border-border px-4 py-8 text-sm text-muted-foreground">
              No activity yet. Status changes, notes, and assisted-apply snapshots show up here.
            </p>
          ) : (
            <ol className="space-y-3">
              {application.events.map((event) => {
                const described = describeEvent(event);
                const answers = assistedApplyAnswers(event.payload);
                const when = event.eventDate ?? event.createdAt;
                return (
                  <li key={event.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <p className="font-medium">{described.title}</p>
                      <time className="text-xs text-muted-foreground" dateTime={when}>
                        {formatDisplayDateTime(when)}
                      </time>
                    </div>
                    {described.detail ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{described.detail}</p>
                    ) : null}
                    {answers.length > 0 ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-blue-600">
                          Saved answers ({answers.length})
                        </summary>
                        <dl className="mt-3 space-y-3">
                          {answers.map((answer, index) => (
                            <div key={`${event.id}-${index}`}>
                              <dt className="text-sm font-medium">{answer.question || "Question"}</dt>
                              <dd className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                {answer.answer || "—"}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
