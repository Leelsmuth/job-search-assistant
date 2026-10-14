"use client";

import Link from "next/link";
import { ApplicationControls, AttentionBadges } from "./application-controls";
import { Card, CardContent } from "@/components/ui/card";
import { formatDisplayDate, type TrackedApplication } from "@/modules/applications/tracker";

function JobLinks({ application }: { application: TrackedApplication }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
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
  );
}

function ApplicationCard({ application }: { application: TrackedApplication }) {
  const needsAttention = application.attention.length > 0;
  return (
    <Card className={needsAttention ? "border-amber-300 bg-amber-50" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div>
          <Link href={`/applications/${application.id}`} className="font-semibold leading-snug hover:underline">
            {application.title}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">{application.companyName}</p>
          <p className="text-sm text-muted-foreground">{application.locationLabel}</p>
          <JobLinks application={application} />
        </div>
        <AttentionBadges flags={application.attention} />
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Applied</dt>
            <dd>
              <time dateTime={application.dateApplied ?? undefined}>
                {formatDisplayDate(application.dateApplied)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Last activity</dt>
            <dd>
              <time dateTime={application.lastActivityAt}>{formatDisplayDate(application.lastActivityAt)}</time>
            </dd>
          </div>
        </dl>
        <ApplicationControls
          key={`${application.id}:${application.status}:${application.notes ?? ""}:${application.followUpDate ?? ""}`}
          idPrefix="card"
          application={application}
        />
      </CardContent>
    </Card>
  );
}

export function ApplicationsList({ applications }: { applications: TrackedApplication[] }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {applications.map((application) => (
          <ApplicationCard key={application.id} application={application} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full min-w-[960px] text-sm">
          <caption className="sr-only">Job applications</caption>
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th scope="col" className="p-3 text-left font-medium">
                Role
              </th>
              <th scope="col" className="p-3 text-left font-medium">
                Company
              </th>
              <th scope="col" className="p-3 text-left font-medium">
                Location
              </th>
              <th scope="col" className="p-3 text-left font-medium">
                Applied
              </th>
              <th scope="col" className="min-w-56 p-3 text-left font-medium">
                Status and follow-up
              </th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr
                key={application.id}
                className={
                  application.attention.length > 0
                    ? "border-b border-amber-200 bg-amber-50"
                    : "border-b border-border"
                }
              >
                <td className="p-3 align-top">
                  <Link
                    href={`/applications/${application.id}`}
                    className="font-medium hover:underline"
                  >
                    {application.title}
                  </Link>
                  <JobLinks application={application} />
                  <div className="mt-2">
                    <AttentionBadges flags={application.attention} />
                  </div>
                </td>
                <td className="p-3 align-top">{application.companyName}</td>
                <td className="p-3 align-top text-muted-foreground">{application.locationLabel}</td>
                <td className="p-3 align-top text-muted-foreground">
                  <time dateTime={application.dateApplied ?? undefined}>
                    {formatDisplayDate(application.dateApplied)}
                  </time>
                </td>
                <td className="p-3 align-top">
                  <ApplicationControls
                    key={`${application.id}:${application.status}:${application.notes ?? ""}:${application.followUpDate ?? ""}`}
                    idPrefix="table"
                    application={application}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
