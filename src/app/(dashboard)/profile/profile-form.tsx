"use client";

import { useState, useTransition } from "react";
import { parseOptionalInt } from "@/lib/utils";
import { updateProfile } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  SENIORITY_OPTIONS,
  REMOTE_PREFERENCE_OPTIONS,
  WORK_AUTHORIZATION_OPTIONS,
  PRIMARY_LOCATION_OPTIONS,
  PREFERRED_LOCATION_OPTIONS,
  TARGET_TITLE_OPTIONS,
  normalizeWorkAuthorization,
  normalizeSeniority,
  normalizeRemotePreference,
} from "@/modules/candidate/profile-options";

type Profile = {
  id: string;
  displayName: string | null;
  location: string | null;
  workAuthorization: string | null;
  targetTitles: unknown;
  preferredSeniority: string | null;
  remotePreference: string | null;
  preferredLocations: unknown;
  minimumSalary: number | null;
  yearsExperience: number | null;
  summary: string | null;
  dealBreakers: unknown;
  skills?: Array<{ name: string; category: string }>;
  experiences?: Array<{
    company: string;
    title: string;
    bullets?: Array<{ text: string }>;
  }>;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function ProfileSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        className={selectClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  function toggle(option: string) {
    onChange(
      selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option]
    );
  }

  return (
    <div className="sm:col-span-2">
      <Label>{label}</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function resolveLocationValue(location: string | null): {
  preset: string;
  custom: string;
} {
  if (!location) return { preset: "", custom: "" };
  const match = PRIMARY_LOCATION_OPTIONS.find((o) => o.value === location);
  if (match) return { preset: location, custom: "" };
  const other = PRIMARY_LOCATION_OPTIONS.find((o) => o.value === "Other");
  if (other) return { preset: "Other", custom: location };
  return { preset: "", custom: location };
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const initialLocation = resolveLocationValue(profile.location);

  const [form, setForm] = useState({
    displayName: profile.displayName ?? "",
    locationPreset: initialLocation.preset,
    locationCustom: initialLocation.custom,
    workAuthorization: normalizeWorkAuthorization(profile.workAuthorization),
    targetTitles: (profile.targetTitles as string[]) ?? [],
    preferredSeniority: normalizeSeniority(profile.preferredSeniority),
    remotePreference: normalizeRemotePreference(profile.remotePreference),
    preferredLocations: (profile.preferredLocations as string[]) ?? [],
    minimumSalary:
      profile.minimumSalary != null && Number.isFinite(profile.minimumSalary)
        ? String(profile.minimumSalary)
        : "",
    yearsExperience:
      profile.yearsExperience != null && Number.isFinite(profile.yearsExperience)
        ? String(profile.yearsExperience)
        : "",
    summary: profile.summary ?? "",
    dealBreakers: ((profile.dealBreakers as string[]) ?? []).join(", "),
  });

  const resolvedLocation =
    form.locationPreset === "Other"
      ? form.locationCustom.trim()
      : form.locationPreset;

  function handleSave() {
    startTransition(async () => {
      try {
        await updateProfile({
          displayName: form.displayName,
          location: resolvedLocation || undefined,
          workAuthorization: form.workAuthorization || undefined,
          targetTitles: form.targetTitles,
          preferredSeniority: form.preferredSeniority || undefined,
          remotePreference: form.remotePreference || undefined,
          preferredLocations: form.preferredLocations,
          minimumSalary: parseOptionalInt(form.minimumSalary),
          yearsExperience: parseOptionalInt(form.yearsExperience),
          summary: form.summary,
          dealBreakers: form.dealBreakers.split(",").map((s) => s.trim()).filter(Boolean),
        });
        setSaved(true);
        toast({
          title: "Profile saved",
          description: "Match scores may be outdated — review your job feed at /jobs",
        });
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        toast({
          title: "Save failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div>
            <Label>Display Name</Label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </div>

          <ProfileSelect
            label="Primary Location"
            value={form.locationPreset}
            onChange={(locationPreset) => setForm({ ...form, locationPreset })}
            options={PRIMARY_LOCATION_OPTIONS}
            placeholder="Select location..."
          />

          {form.locationPreset === "Other" && (
            <div className="sm:col-span-2">
              <Label>Custom Location</Label>
              <Input
                value={form.locationCustom}
                onChange={(e) => setForm({ ...form, locationCustom: e.target.value })}
                placeholder="e.g. Ottawa, ON"
              />
            </div>
          )}

          <ProfileSelect
            label="Work Authorization"
            value={form.workAuthorization}
            onChange={(workAuthorization) => setForm({ ...form, workAuthorization })}
            options={WORK_AUTHORIZATION_OPTIONS}
            placeholder="Select authorization..."
          />

          <ProfileSelect
            label="Preferred Seniority"
            value={form.preferredSeniority}
            onChange={(preferredSeniority) => setForm({ ...form, preferredSeniority })}
            options={SENIORITY_OPTIONS}
            placeholder="Select seniority..."
          />

          <ProfileSelect
            label="Remote Preference"
            value={form.remotePreference}
            onChange={(remotePreference) => setForm({ ...form, remotePreference })}
            options={REMOTE_PREFERENCE_OPTIONS}
            placeholder="Select preference..."
          />

          <div>
            <Label>Years Experience</Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={form.yearsExperience}
              onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })}
              placeholder="e.g. 7"
            />
          </div>

          <div>
            <Label>Minimum Salary (CAD)</Label>
            <Input
              type="number"
              min={0}
              step={1000}
              value={form.minimumSalary}
              onChange={(e) => setForm({ ...form, minimumSalary: e.target.value })}
              placeholder="e.g. 130000"
            />
          </div>

          <CheckboxGroup
            label="Target Titles"
            options={TARGET_TITLE_OPTIONS}
            selected={form.targetTitles}
            onChange={(targetTitles) => setForm({ ...form, targetTitles })}
          />

          <CheckboxGroup
            label="Preferred Locations"
            options={PREFERRED_LOCATION_OPTIONS}
            selected={form.preferredLocations}
            onChange={(preferredLocations) => setForm({ ...form, preferredLocations })}
          />

          <div className="sm:col-span-2">
            <Label>Summary</Label>
            <Textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              rows={4}
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Deal Breakers (comma-separated)</Label>
            <Input
              value={form.dealBreakers}
              onChange={(e) => setForm({ ...form, dealBreakers: e.target.value })}
              placeholder="e.g. On-site only outside Canada"
            />
          </div>
        </CardContent>
      </Card>

      {profile.skills && profile.skills.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-2 font-medium">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s, i) => (
                <span key={i} className="rounded-full bg-secondary px-2 py-1 text-xs">
                  {s.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {profile.experiences?.map((exp, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <h3 className="font-medium">
              {exp.title} at {exp.company}
            </h3>
            <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
              {exp.bullets?.map((b, j) => (
                <li key={j}>{b.text}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving..." : saved ? "Saved!" : "Save Profile"}
      </Button>
    </div>
  );
}
