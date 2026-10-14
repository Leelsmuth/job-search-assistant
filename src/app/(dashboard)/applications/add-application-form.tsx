"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addManualApplication } from "@/server/actions/application-tracker-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { usePendingTransition } from "@/components/layout/action-pending-provider";
import { TRACKER_STAGES, statusLabel } from "@/modules/applications/tracker";

const fieldClass =
  "mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const EMPTY = {
  company: "",
  title: "",
  jobUrl: "",
  location: "",
  workplaceType: "",
  status: "saved",
  dateApplied: "",
  followUpDate: "",
  notes: "",
};

export function AddApplicationForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { isPending, run } = usePendingTransition();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  function update(field: keyof typeof EMPTY, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    run(async () => {
      try {
        const result = await addManualApplication(form);
        setForm(EMPTY);
        toast({ title: "Application added" });
        router.push(`/applications/${result.applicationId}`);
        router.refresh();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not add the application";
        setError(message);
        toast({ title: "Could not add application", description: message, variant: "destructive" });
      }
    });
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
      <div>
        <Label htmlFor="manual-company">Company</Label>
        <Input
          id="manual-company"
          name="company"
          required
          autoComplete="organization"
          value={form.company}
          onChange={(event) => update("company", event.target.value)}
          className="mt-1 min-h-10"
        />
      </div>
      <div>
        <Label htmlFor="manual-title">Role title</Label>
        <Input
          id="manual-title"
          name="title"
          required
          value={form.title}
          onChange={(event) => update("title", event.target.value)}
          className="mt-1 min-h-10"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="manual-url">Job URL</Label>
        <Input
          id="manual-url"
          name="jobUrl"
          type="url"
          required
          inputMode="url"
          placeholder="https://"
          value={form.jobUrl}
          onChange={(event) => update("jobUrl", event.target.value)}
          className="mt-1 min-h-10"
        />
      </div>
      <div>
        <Label htmlFor="manual-location">Location</Label>
        <Input
          id="manual-location"
          name="location"
          value={form.location}
          onChange={(event) => update("location", event.target.value)}
          className="mt-1 min-h-10"
        />
      </div>
      <div>
        <Label htmlFor="manual-workplace">Workplace</Label>
        <select
          id="manual-workplace"
          name="workplaceType"
          className={fieldClass}
          value={form.workplaceType}
          onChange={(event) => update("workplaceType", event.target.value)}
        >
          <option value="">Not specified</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="on_site">On-site</option>
        </select>
      </div>
      <div>
        <Label htmlFor="manual-status">Status</Label>
        <select
          id="manual-status"
          name="status"
          className={fieldClass}
          value={form.status}
          onChange={(event) => update("status", event.target.value)}
        >
          {TRACKER_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {statusLabel(stage)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="manual-applied">Date applied</Label>
        <input
          id="manual-applied"
          name="dateApplied"
          type="date"
          className={fieldClass}
          value={form.dateApplied}
          onChange={(event) => update("dateApplied", event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="manual-follow-up">Follow-up date</Label>
        <input
          id="manual-follow-up"
          name="followUpDate"
          type="date"
          className={fieldClass}
          value={form.followUpDate}
          onChange={(event) => update("followUpDate", event.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="manual-notes">Notes</Label>
        <Textarea
          id="manual-notes"
          name="notes"
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          className="mt-1"
          rows={3}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" className="min-h-10" loading={isPending}>
          Save application
        </Button>
      </div>
    </form>
  );
}
