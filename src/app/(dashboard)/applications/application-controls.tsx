"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateTrackedAppliedDate,
  updateTrackedFollowUp,
  updateTrackedNotes,
  updateTrackedStatus,
} from "@/server/actions/application-tracker-actions";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  attentionLabel,
  formatCalendarDate,
  isApplicationStatus,
  statusLabel,
  statusOptions,
  type AttentionFlag,
  type TrackedApplication,
} from "@/modules/applications/tracker";
import { Badge } from "@/components/ui/badge";

const fieldClass =
  "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type ControlsApplication = Pick<
  TrackedApplication,
  "id" | "status" | "notes" | "followUpDate" | "dateApplied" | "title" | "companyName"
>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function AttentionBadges({ flags }: { flags: AttentionFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <li key={flag}>
          <Badge className="border-amber-300 bg-amber-50 font-medium text-amber-950">
            {attentionLabel(flag)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function ApplicationControls({
  application,
  notesMode = "compact",
  showAppliedDate = false,
  idPrefix = "",
}: {
  application: ControlsApplication;
  notesMode?: "compact" | "inline";
  showAppliedDate?: boolean;
  idPrefix?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const [status, setStatus] = useState(application.status);
  const [notes, setNotes] = useState(application.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(notesMode === "inline");
  const [followUp, setFollowUp] = useState(formatCalendarDate(application.followUpDate));
  const [appliedOn, setAppliedOn] = useState(formatCalendarDate(application.dateApplied));
  const subject = `${application.title} at ${application.companyName}`;

  function saveStatus(next: string) {
    if (!isApplicationStatus(next) || next === status) return;
    const previous = status;
    setStatus(next);
    run(`status-${application.id}`, async () => {
      try {
        await updateTrackedStatus(application.id, next);
        router.refresh();
        toast({ title: "Status updated", description: statusLabel(next) });
      } catch (error) {
        setStatus(previous);
        toast({
          title: "Could not update status",
          description: errorMessage(error),
          variant: "destructive",
        });
      }
    });
  }

  function saveNotes() {
    run(`notes-${application.id}`, async () => {
      try {
        await updateTrackedNotes(application.id, notes);
        router.refresh();
        if (notesMode === "compact") setNotesOpen(false);
        toast({ title: "Notes saved" });
      } catch (error) {
        toast({
          title: "Could not save notes",
          description: errorMessage(error),
          variant: "destructive",
        });
      }
    });
  }

  function saveFollowUp(next: string) {
    const previous = followUp;
    setFollowUp(next);
    run(`follow-${application.id}`, async () => {
      try {
        await updateTrackedFollowUp(application.id, next);
        router.refresh();
        toast({ title: next ? "Follow-up saved" : "Follow-up cleared" });
      } catch (error) {
        setFollowUp(previous);
        toast({
          title: "Could not save follow-up",
          description: errorMessage(error),
          variant: "destructive",
        });
      }
    });
  }

  function saveAppliedDate(next: string) {
    const previous = appliedOn;
    setAppliedOn(next);
    run(`applied-${application.id}`, async () => {
      try {
        await updateTrackedAppliedDate(application.id, next);
        router.refresh();
        toast({ title: next ? "Applied date saved" : "Applied date cleared" });
      } catch (error) {
        setAppliedOn(previous);
        toast({
          title: "Could not save applied date",
          description: errorMessage(error),
          variant: "destructive",
        });
      }
    });
  }

  const prefix = idPrefix ? `${idPrefix}-` : "";
  const statusId = `${prefix}status-${application.id}`;
  const followId = `${prefix}follow-up-${application.id}`;
  const notesId = `${prefix}notes-${application.id}`;
  const appliedId = `${prefix}applied-on-${application.id}`;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={statusId} className="text-xs text-muted-foreground">
          Status
        </Label>
        <div className="flex items-center gap-2">
          <select
            id={statusId}
            className={fieldClass}
            value={status}
            disabled={isKeyPending(`status-${application.id}`)}
            aria-label={`Status for ${subject}`}
            onChange={(event) => saveStatus(event.target.value)}
          >
            {statusOptions(status).map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
          {isKeyPending(`status-${application.id}`) ? <Spinner className="h-4 w-4 shrink-0" /> : null}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={followId} className="text-xs text-muted-foreground">
          Follow-up
        </Label>
        <input
          id={followId}
          type="date"
          className={fieldClass}
          value={followUp}
          disabled={isKeyPending(`follow-${application.id}`)}
          aria-label={`Follow-up date for ${subject}`}
          onChange={(event) => saveFollowUp(event.target.value)}
        />
      </div>

      {showAppliedDate ? (
        <div className="space-y-1">
          <Label htmlFor={appliedId} className="text-xs text-muted-foreground">
            Date applied
          </Label>
          <input
            id={appliedId}
            type="date"
            className={fieldClass}
            value={appliedOn}
            disabled={isKeyPending(`applied-${application.id}`)}
            aria-label={`Date applied for ${subject}`}
            onChange={(event) => saveAppliedDate(event.target.value)}
          />
        </div>
      ) : null}

      <div className="space-y-1">
        {notesOpen ? (
          <>
            <Label htmlFor={notesId} className="text-xs text-muted-foreground">
              Notes
            </Label>
            <Textarea
              id={notesId}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              aria-label={`Notes for ${subject}`}
              rows={notesMode === "inline" ? 6 : 3}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-10 flex-1"
                loading={isKeyPending(`notes-${application.id}`)}
                onClick={saveNotes}
              >
                Save notes
              </Button>
              {notesMode === "compact" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-10 flex-1"
                  onClick={() => {
                    setNotes(application.notes ?? "");
                    setNotesOpen(false);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto min-h-10 w-full justify-start px-2 py-2 text-left text-xs"
            aria-label={`Edit notes for ${subject}`}
            onClick={() => setNotesOpen(true)}
          >
            <span className="line-clamp-2 whitespace-normal">
              {application.notes?.trim() ? application.notes : "Add notes"}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
