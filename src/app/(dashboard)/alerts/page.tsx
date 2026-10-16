import Link from "next/link";
import { listJobAlerts } from "@/server/actions/alert-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTorontoDateTime } from "@/modules/digest/time";

export default async function AlertsPage() {
  const data = await listJobAlerts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Fresh matches emailed between discovery ticks. Overnight alerts stay queued until 7:00 AM
          Toronto time.
        </p>
      </div>
      {!data.schemaReady ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Apply <code>drizzle/migrations/0023_discovery_tick_and_alerts.sql</code> in the Supabase
            SQL editor before alerts can be stored.
          </CardContent>
        </Card>
      ) : data.alerts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No alerts yet. New postings that clear your digest minimum show up here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.alerts.map((alert) => (
            <Card key={alert.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/jobs/${alert.jobId}`} className="font-medium hover:underline">
                    {alert.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {alert.companyName}
                    {alert.fitScore != null ? ` · ${Math.round(alert.fitScore)}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <Badge className={alert.status === "sent" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}>
                    {alert.status === "sent" ? "Sent" : "Queued"}
                  </Badge>
                  <p className="mt-1">
                    {alert.sentAt
                      ? formatTorontoDateTime(new Date(alert.sentAt))
                      : alert.queuedUntil
                        ? `Until ${formatTorontoDateTime(new Date(alert.queuedUntil))}`
                        : formatTorontoDateTime(new Date(alert.createdAt))}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
