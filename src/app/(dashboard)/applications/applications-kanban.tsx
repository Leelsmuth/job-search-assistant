"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateApplicationStatus } from "@/server/actions";
import type { ApplicationStatus } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import { Spinner } from "@/components/ui/spinner";
import { ApplyLink } from "@/components/jobs/apply-link";

type App = {
  id: string;
  status: string;
  notes: string | null;
  jobId: string;
  job: {
    title: string;
    jobUrl: string | null;
    company: { name: string } | null;
  } | null;
};

const PIPELINE_COLUMNS: ApplicationStatus[] = [
  "discovered",
  "reviewing",
  "saved",
  "preparing",
  "ready_to_apply",
  "applied",
  "recruiter_screen",
  "technical_interview",
  "final_interview",
  "offer",
];

const CLOSED_STATUSES: ApplicationStatus[] = ["rejected", "withdrawn"];

const POST_APPLY_STATUSES = new Set<ApplicationStatus>([
  "applied",
  "recruiter_screen",
  "technical_interview",
  "final_interview",
  "offer",
]);

export function ApplicationsKanban({ applications }: { applications: App[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();

  function changeStatus(applicationId: string, status: ApplicationStatus) {
    run(`kanban-${applicationId}`, async () => {
      try {
        await updateApplicationStatus(applicationId, status);
        router.refresh();
        toast({ title: "Status updated" });
      } catch (e) {
        toast({
          title: "Update failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Applications — Kanban</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/applications">Table</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href="/applications?view=kanban">Kanban</Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_COLUMNS.map((status) => {
          const items = applications.filter((a) => a.status === status);
          return (
            <div
              key={status}
              className="min-w-[220px] rounded-lg border border-border bg-muted/30 p-3"
            >
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {status.replace(/_/g, " ")} ({items.length})
              </h3>
              <div className="space-y-2">
                {items.map((app) => (
                  <div
                    key={app.id}
                    className="rounded-md border border-border bg-card p-2 text-sm"
                  >
                    <Link
                      href={`/jobs/${app.jobId}`}
                      className="block hover:text-primary"
                    >
                      <p className="font-medium">{app.job?.title ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {app.job?.company?.name ?? "—"}
                      </p>
                    </Link>
                    {app.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {app.notes}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <ApplyLink
                        jobId={app.jobId}
                        jobUrl={app.job?.jobUrl}
                        variant="outline"
                        showIcon={false}
                        isAlreadyApplied={POST_APPLY_STATUSES.has(
                          app.status as ApplicationStatus
                        )}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <select
                        className="w-full rounded border border-input px-1 py-0.5 text-xs"
                        value={app.status}
                        disabled={isKeyPending(`kanban-${app.id}`)}
                        onChange={(e) =>
                          changeStatus(app.id, e.target.value as ApplicationStatus)
                        }
                      >
                        {[...PIPELINE_COLUMNS, ...CLOSED_STATUSES].map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                      {isKeyPending(`kanban-${app.id}`) ? (
                        <Spinner className="h-3 w-3" />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="min-w-[180px] rounded-lg border border-dashed border-border bg-muted/20 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Closed
          </h3>
          <div className="space-y-2">
            {applications
              .filter((a) => CLOSED_STATUSES.includes(a.status as ApplicationStatus))
              .map((app) => (
                <Link
                  key={app.id}
                  href={`/jobs/${app.jobId}`}
                  className="block rounded-md border border-border bg-card p-2 text-sm hover:bg-accent/50"
                >
                  <div className="flex items-center gap-1">
                    <p className="font-medium">{app.job?.title}</p>
                    <Badge className="text-[10px]">{app.status}</Badge>
                  </div>
                  <ApplyLink
                    jobId={app.jobId}
                    jobUrl={app.job?.jobUrl}
                    variant="ghost"
                    showIcon={false}
                    className="mt-1 h-7 px-2"
                    isAlreadyApplied={POST_APPLY_STATUSES.has(
                      app.status as ApplicationStatus
                    )}
                  />
                  {app.notes ? (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {app.notes}
                    </p>
                  ) : null}
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
