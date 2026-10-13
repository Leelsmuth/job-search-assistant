"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateApplicationStatus, updateApplicationNotes } from "@/server/actions";
import type { ApplicationStatus } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMatchScore } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import { Spinner } from "@/components/ui/spinner";
import { ApplyLink } from "@/components/jobs/apply-link";

export type ApplicationListItem = {
  id: string;
  status: string;
  notes: string | null;
  dateSaved: Date | null;
  dateApplied: Date | null;
  jobId: string;
  job: {
    title: string;
    jobUrl: string | null;
    company: { name: string } | null;
    matchAnalyses: Array<{ overallScore: number; classification: string }>;
  } | null;
};

const STATUSES: ApplicationStatus[] = [
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
  "rejected",
  "withdrawn",
];

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function ApplicationNotesField({
  appId,
  initialNotes,
  fullWidth = false,
}: {
  appId: string;
  initialNotes: string | null;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`h-auto min-h-10 px-1 py-2 text-xs ${fullWidth ? "w-full justify-start" : ""}`}
        onClick={() => setOpen(true)}
      >
        {initialNotes ? `${initialNotes.slice(0, fullWidth ? 120 : 40)}…` : "Add notes"}
      </Button>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${fullWidth ? "w-full" : "min-w-[200px]"}`}>
      <textarea
        className="min-h-[80px] w-full rounded-md border border-input px-3 py-2 text-sm"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="min-h-10 flex-1"
          loading={isKeyPending(`notes-${appId}`)}
          onClick={() =>
            run(`notes-${appId}`, async () => {
              try {
                await updateApplicationNotes(appId, notes);
                router.refresh();
                setOpen(false);
                toast({ title: "Notes saved" });
              } catch (err) {
                toast({
                  title: "Save failed",
                  description: err instanceof Error ? err.message : "Unknown error",
                  variant: "destructive",
                });
              }
            })
          }
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-10 flex-1"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ApplicationStatusSelect({
  appId,
  status,
  onUpdated,
  compact = false,
}: {
  appId: string;
  status: string;
  onUpdated: () => void;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const saving = isKeyPending(`status-${appId}`);

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "w-full"}`}>
      <select
        className={
          compact
            ? "rounded border border-input px-2 py-1 text-xs"
            : "min-h-10 w-full rounded-md border border-input px-3 py-2 text-sm"
        }
        value={status}
        disabled={saving}
        onChange={(e) =>
          run(`status-${appId}`, async () => {
            try {
              await updateApplicationStatus(appId, e.target.value as ApplicationStatus);
              onUpdated();
              toast({ title: "Status updated" });
            } catch (err) {
              toast({
                title: "Update failed",
                description: err instanceof Error ? err.message : "Unknown error",
                variant: "destructive",
              });
            }
          })
        }
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {formatStatus(s)}
          </option>
        ))}
      </select>
      {saving ? <Spinner className="h-4 w-4 shrink-0" /> : null}
    </div>
  );
}

function ApplicationMobileCard({ app }: { app: ApplicationListItem }) {
  const router = useRouter();
  const match = app.job?.matchAnalyses[0];

  return (
    <Card aria-busy={false}>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/jobs/${app.jobId}`}
                className="line-clamp-2 font-semibold leading-snug hover:underline"
              >
                {app.job?.title ?? "Unknown role"}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {app.job?.company?.name ?? "Unknown company"}
              </p>
            </div>
            {match ? (
              <Badge className="shrink-0 border border-border bg-transparent">
                {formatMatchScore(match.overallScore)}
              </Badge>
            ) : null}
          </div>
          {match ? (
            <p className="text-xs capitalize text-muted-foreground">{match.classification}</p>
          ) : null}
        </div>

        <ApplicationStatusSelect
          appId={app.id}
          status={app.status}
          onUpdated={() => router.refresh()}
        />

        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Saved</p>
            <p>{app.dateSaved ? new Date(app.dateSaved).toLocaleDateString() : "—"}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Applied</p>
            <p>{app.dateApplied ? new Date(app.dateApplied).toLocaleDateString() : "—"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Notes</p>
          <ApplicationNotesField appId={app.id} initialNotes={app.notes} fullWidth />
        </div>

        {app.job?.jobUrl ? (
          <ApplyLink
            jobId={app.jobId}
            jobUrl={app.job.jobUrl}
            className="min-h-10 w-full"
            isAlreadyApplied={app.status === "applied"}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ApplicationsEmptyState() {
  return (
    <div className="rounded-lg border border-border py-12 text-center">
      <p className="text-muted-foreground">
        No applications yet. Save a job from the feed to start tracking.
      </p>
      <Link href="/jobs" className="mt-4 inline-block min-h-10 py-2 text-sm text-blue-600 hover:underline">
        Browse job feed
      </Link>
    </div>
  );
}

export function ApplicationsTable({ applications }: { applications: ApplicationListItem[] }) {
  const router = useRouter();

  if (applications.length === 0) {
    return <ApplicationsEmptyState />;
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {applications.map((app) => (
          <ApplicationMobileCard key={app.id} app={app} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium">Role</th>
              <th className="p-3 text-left font-medium">Apply</th>
              <th className="p-3 text-left font-medium">Company</th>
              <th className="p-3 text-left font-medium">Match</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium">Notes</th>
              <th className="p-3 text-left font-medium">Saved</th>
              <th className="p-3 text-left font-medium">Applied</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((app) => {
              const match = app.job?.matchAnalyses[0];
              return (
                <tr key={app.id} className="border-b border-border">
                  <td className="p-3 font-medium">
                    <Link href={`/jobs/${app.jobId}`} className="hover:underline">
                      {app.job?.title}
                    </Link>
                  </td>
                  <td className="p-3">
                    {app.job?.jobUrl ? (
                      <ApplyLink
                        jobId={app.jobId}
                        jobUrl={app.job.jobUrl}
                        isAlreadyApplied={app.status === "applied"}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">{app.job?.company?.name}</td>
                  <td className="p-3">
                    {match ? (
                      <Badge className="border border-border bg-transparent">
                        {formatMatchScore(match.overallScore)} {match.classification}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <ApplicationStatusSelect
                      appId={app.id}
                      status={app.status}
                      onUpdated={() => router.refresh()}
                      compact
                    />
                  </td>
                  <td className="p-3">
                    <ApplicationNotesField appId={app.id} initialNotes={app.notes} />
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {app.dateSaved ? new Date(app.dateSaved).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {app.dateApplied ? new Date(app.dateApplied).toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
