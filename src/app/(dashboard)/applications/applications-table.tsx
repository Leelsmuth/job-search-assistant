"use client";

import Link from "next/link";
import { useTransition } from "react";
import { updateApplicationStatus } from "@/server/actions";
import type { ApplicationStatus } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatMatchScore } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

type App = {
  id: string;
  status: string;
  notes: string | null;
  dateSaved: Date | null;
  dateApplied: Date | null;
  jobId: string;
  job: {
    title: string;
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

export function ApplicationsTable({ applications }: { applications: App[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

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
            <th className="p-3 text-left font-medium">Company</th>
            <th className="p-3 text-left font-medium">Match</th>
            <th className="p-3 text-left font-medium">Status</th>
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
                  <select
                    className="rounded border border-input px-2 py-1 text-xs"
                    value={app.status}
                    disabled={isPending}
                    onChange={(e) =>
                      startTransition(async () => {
                        try {
                          await updateApplicationStatus(
                            app.id,
                            e.target.value as ApplicationStatus
                          );
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
                </td>
                <td className="p-3 text-muted-foreground">
                  {app.dateSaved
                    ? new Date(app.dateSaved).toLocaleDateString()
                    : "—"}
                </td>
                <td className="p-3 text-muted-foreground">
                  {app.dateApplied
                    ? new Date(app.dateApplied).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
