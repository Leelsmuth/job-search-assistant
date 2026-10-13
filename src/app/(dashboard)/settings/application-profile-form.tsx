"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveApplicationProfile } from "@/server/actions/apply-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import type { ApplicationProfile, SavedAnswerInput } from "@/modules/apply/types";

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function ApplicationProfileForm({
  initial,
  schemaReady,
}: {
  initial: ApplicationProfile;
  schemaReady: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [profile, setProfile] = useState(initial);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof ApplicationProfile>(key: K, value: ApplicationProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updateSaved(id: string, patch: Partial<SavedAnswerInput>) {
    setProfile((current) => ({
      ...current,
      savedAnswers: current.savedAnswers.map((answer) => (answer.id === id ? { ...answer, ...patch } : answer)),
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Application profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Reused when you prepare an application. Defaults: Canadian citizen, no sponsorship, and
          voluntary self-identification set to Prefer not to say. Nothing here is submitted for you.
        </p>
        {!schemaReady ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Apply <code>drizzle/migrations/0013_assisted_apply.sql</code> in the Supabase SQL editor
            before saving this profile. Do not run it from CI.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="legal-name" label="Legal name" value={profile.legalName} onChange={(value) => setField("legalName", value)} />
          <Field id="apply-email" label="Email" type="email" value={profile.email} onChange={(value) => setField("email", value)} />
          <Field id="phone" label="Phone" value={profile.phone} onChange={(value) => setField("phone", value)} />
          <Field id="city" label="City" value={profile.city} onChange={(value) => setField("city", value)} />
          <Field id="province" label="Province" value={profile.province} onChange={(value) => setField("province", value)} />
          <Field id="linkedin" label="LinkedIn" type="url" value={profile.linkedinUrl} onChange={(value) => setField("linkedinUrl", value)} />
          <Field id="github" label="GitHub" type="url" value={profile.githubUrl} onChange={(value) => setField("githubUrl", value)} />
          <Field id="portfolio" label="Portfolio" type="url" value={profile.portfolioUrl} onChange={(value) => setField("portfolioUrl", value)} />
          <Field
            id="work-auth"
            label="Work authorization in Canada"
            value={profile.workAuthorization}
            onChange={(value) => setField("workAuthorization", value)}
          />
          <Field
            id="start-date"
            label="Earliest start date"
            type="date"
            value={profile.earliestStartDate}
            onChange={(value) => setField("earliestStartDate", value)}
          />
          <Field
            id="salary"
            label="Salary expectation (CAD)"
            type="number"
            value={profile.salaryExpectationCad == null ? "" : String(profile.salaryExpectationCad)}
            onChange={(value) => {
              if (!value.trim()) {
                setField("salaryExpectationCad", null);
                return;
              }
              const parsed = Number(value);
              setField("salaryExpectationCad", Number.isFinite(parsed) ? Math.trunc(parsed) : null);
            }}
          />
          <Field id="pronouns" label="Pronouns (optional)" value={profile.pronouns} onChange={(value) => setField("pronouns", value)} />
        </div>
        <div>
          <Label htmlFor="hear">How did you hear about roles?</Label>
          <Input id="hear" value={profile.howDidYouHear} onChange={(event) => setField("howDidYouHear", event.target.value)} />
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={profile.requiresSponsorship}
              onChange={(event) => setField("requiresSponsorship", event.target.checked)}
            />
            Requires sponsorship
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={profile.willingToRelocate}
              onChange={(event) => setField("willingToRelocate", event.target.checked)}
            />
            Willing to relocate
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="eeoGender" label="Gender (voluntary)" value={profile.eeoGender} onChange={(value) => setField("eeoGender", value || "Prefer not to say")} />
          <Field id="eeoRace" label="Race or ethnicity (voluntary)" value={profile.eeoRace} onChange={(value) => setField("eeoRace", value || "Prefer not to say")} />
          <Field id="eeoVeteran" label="Veteran status (voluntary)" value={profile.eeoVeteran} onChange={(value) => setField("eeoVeteran", value || "Prefer not to say")} />
          <Field id="eeoDisability" label="Disability status (voluntary)" value={profile.eeoDisability} onChange={(value) => setField("eeoDisability", value || "Prefer not to say")} />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Saved answers</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setProfile((current) => ({
                  ...current,
                  savedAnswers: [
                    ...current.savedAnswers,
                    { id: crypto.randomUUID(), question: "", answer: "" },
                  ],
                }))
              }
            >
              Add answer
            </Button>
          </div>
          {profile.savedAnswers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add reusable answers for questions you see often, such as what you are looking for in a role.
            </p>
          ) : null}
          {profile.savedAnswers.map((answer) => (
            <div key={answer.id} className="space-y-2 rounded-md border border-border p-3">
              <Label htmlFor={`saved-q-${answer.id}`}>Question</Label>
              <Input
                id={`saved-q-${answer.id}`}
                value={answer.question}
                onChange={(event) => updateSaved(answer.id, { question: event.target.value })}
              />
              <Label htmlFor={`saved-a-${answer.id}`}>Answer</Label>
              <Textarea
                id={`saved-a-${answer.id}`}
                value={answer.answer}
                onChange={(event) => updateSaved(answer.id, { answer: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    savedAnswers: current.savedAnswers.filter((item) => item.id !== answer.id),
                  }))
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            loading={pending}
            disabled={!schemaReady}
            onClick={() => {
              setPending(true);
              saveApplicationProfile({
                ...profile,
                salaryExpectationCad:
                  profile.salaryExpectationCad == null || Number.isNaN(profile.salaryExpectationCad)
                    ? null
                    : profile.salaryExpectationCad,
                savedAnswers: profile.savedAnswers.filter(
                  (answer) => answer.question.trim() && answer.answer.trim()
                ),
              })
                .then(() => {
                  router.refresh();
                  toast({ title: "Application profile saved" });
                })
                .catch((error: unknown) => {
                  toast({
                    title: "Could not save application profile",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive",
                  });
                })
                .finally(() => setPending(false));
            }}
          >
            Save application profile
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/settings/apply-assist">Form filler script</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
