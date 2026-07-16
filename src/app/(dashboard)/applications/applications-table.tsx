"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateApplicationStatus, updateApplicationNotes } from "@/server/actions";
import type { ApplicationStatus } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMatchScore } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import { Spinner } from "@/components/ui/spinner";
import { ApplyTextLink } from "@/components/jobs/apply-link";

type App = {
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

function NotesCell({ appId, initialNotes }: { appId: string; initialNotes: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="h-auto px-1 py-0 text-xs" onClick={() => setOpen(true)}>
        {initialNotes ? `${initialNotes.slice(0, 40)}…` : "Add notes"}
      </Button>
    );
  }

  return (
    <div className="flex min-w-[200px] flex-col gap-1">
      <textarea
        className="min-h-[60px] rounded border border-input px-2 py-1 text-xs"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
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
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ApplicationsTable({ applications }: { applications: App[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();

  if (applications.length === 0) {
    return (
      <div className="rounded-lg border border-border py-12 text-center">
        <p className="text-muted-foreground">
          No applications yet. Save a job from the feed to start tracking.
        </p>
        <Link href="/jobs" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Browse job feed
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
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
            const saving = isKeyPending(`status-${app.id}`);
            return (
              <tr key={app.id} className="border-b border-border" aria-busy={saving}>
                <td className="p-3 font-medium">
                  <Link href={`/jobs/${app.jobId}`} className="hover:underline">
                    {app.job?.title}
                  </Link>
                </td>
                <td className="p-3">
                  {app.job?.jobUrl ? (
                    <ApplyTextLink jobId={app.jobId} jobUrl={app.job.jobUrl} />
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
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded border border-input px-2 py-1 text-xs"
                      value={app.status}
                      disabled={saving}
                      onChange={(e) =>
                        run(`status-${app.id}`, async () => {
                          try {
                            await updateApplicationStatus(
                              app.id,
                              e.target.value as ApplicationStatus
                            );
                            router.refresh();
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
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    {saving ? <Spinner className="h-3 w-3" /> : null}
                  </div>
                </td>
                <td className="p-3">
                  <NotesCell appId={app.id} initialNotes={app.notes} />
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
  );
}
