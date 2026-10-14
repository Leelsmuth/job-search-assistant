import Link from "next/link";
import { getDigestPageData } from "@/server/actions/digest-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTorontoDateTime } from "@/modules/digest/time";
import type { DigestSkipReason } from "@/modules/digest/types";

export default async function DigestPage() {
  const data = await getDigestPageData();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Morning digest</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New frontend matches since the last digest, plus follow-ups due and applications that
          have been applied for 14 days with no activity. The email runs at 8:00 AM Toronto time
          during daylight time (12:00 UTC).
        </p>
      </div>

      {data.schemaReady ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Digest storage is not ready</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apply <code>drizzle/migrations/0016_job_digests.sql</code> in the Supabase SQL editor.
            The app does not apply this migration itself.
          </CardContent>
        </Card>
      )}

      {data.schemaReady ? (
        <p className="text-sm text-muted-foreground">
          {data.emailsEnabled ? "Email is on." : "Email is off. This page still updates."}{" "}
          {data.lastSentAt ? `Last email ${formatTorontoDateTime(new Date(data.lastSentAt))}.` : "No email sent yet."}{" "}
          <Link href="/settings" className="text-primary underline">
            Change this in Settings
          </Link>
          .
        </p>
      ) : null}

      {data.schemaReady && !data.digest ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No digest yet. The first morning with a new eligible match or a tracker reminder will
            show up here.
          </CardContent>
        </Card>
      ) : null}

      {data.digest ? <DigestBody digest={data.digest} /> : null}
    </div>
  );
}

function DigestBody({
  digest,
}: {
  digest: NonNullable<Awaited<ReturnType<typeof getDigestPageData>>["digest"]>;
}) {
  const generated = new Date(digest.generatedAt);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <time dateTime={digest.generatedAt}>{formatTorontoDateTime(generated)}</time>
        {" · "}
        {deliveryLabel(digest.skipReason, digest.emailedAt)}
      </p>

      <section className="space-y-3" aria-labelledby="digest-matches">
        <h2 id="digest-matches" className="text-base font-semibold">
          New matches
        </h2>
        {digest.payload.jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No new eligible frontend matches in this digest.</p>
        ) : (
          <ol className="space-y-3">
            {digest.payload.jobs.map((job) => (
              <li key={job.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={job.href} className="font-medium hover:underline">
                      {job.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">{job.companyName}</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{job.score}</p>
                </div>
                <p className="mt-2 text-sm">{job.locationLabel}</p>
                {job.reason ? <p className="mt-1 text-sm text-muted-foreground">{job.reason}</p> : null}
                {job.postingUrl ? (
                  <a
                    href={job.postingUrl}
                    className="mt-2 inline-flex min-h-10 items-center text-sm text-primary underline"
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open posting
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="digest-follow-ups">
        <h2 id="digest-follow-ups" className="text-base font-semibold">
          Follow-ups due
        </h2>
        {digest.payload.followUps.length === 0 ? (
          <p className="text-sm text-muted-foreground">None due today or overdue.</p>
        ) : (
          <ul className="space-y-2">
            {digest.payload.followUps.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="text-sm hover:underline">
                  {item.title}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {" "}
                  — {item.companyName} · {item.overdue ? "Overdue" : "Due today"} {item.followUpDate}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="digest-stale">
        <h2 id="digest-stale" className="text-base font-semibold">
          Applied with no activity for 14+ days
        </h2>
        {digest.payload.staleApplied.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="space-y-2">
            {digest.payload.staleApplied.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="text-sm hover:underline">
                  {item.title}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {" "}
                  — {item.companyName} · {item.daysQuiet} days quiet
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/applications" className="inline-flex min-h-10 items-center text-sm text-primary underline">
        Open tracker
      </Link>
    </div>
  );
}

function deliveryLabel(reason: DigestSkipReason | null, emailedAt: string | null): string {
  if (emailedAt) return `Emailed ${formatTorontoDateTime(new Date(emailedAt))}`;
  switch (reason) {
    case "emails_disabled":
      return "Saved here. Email is turned off.";
    case "already_sent_today":
      return "Saved here. Email already went out today.";
    case "resend_not_configured":
      return "Saved here. Resend is not configured, so no email was sent.";
    case "missing_recipient":
      return "Saved here. This account has no auth email.";
    case "send_failed":
      return "Saved here. The email did not send.";
    default:
      return "Saved in the app.";
  }
}
