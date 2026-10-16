"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSearchPreferences } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import type { SearchPreferences } from "@/modules/matching/search-preferences";

export function SearchPreferencesForm({ initial }: { initial: SearchPreferences }) {
  const router = useRouter();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState(initial);
  const [titlesText, setTitlesText] = useState(initial.targetTitles.join(", "));
  const [citiesText, setCitiesText] = useState(initial.gtaCities.join(", "));
  const [pending, setPending] = useState(false);

  function toggle(key: keyof SearchPreferences) {
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Search preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Defaults target frontend roles that are remote and open to anywhere in Canada, plus
          hybrid or on-site roles in Toronto and the GTA. US-only and out-of-area roles stay
          hidden until you opt in. Saving reclassifies jobs already in your feed.
        </p>
        <div>
          <Label htmlFor="target-titles">Target titles</Label>
          <Input
            id="target-titles"
            value={titlesText}
            onChange={(event) => setTitlesText(event.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="seniority">Preferred seniority</Label>
            <select
              id="seniority"
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              value={prefs.preferredSeniority}
              onChange={(event) =>
                setPrefs((current) => ({
                  ...current,
                  preferredSeniority: event.target.value as SearchPreferences["preferredSeniority"],
                }))
              }
            >
              <option value="intern">Intern</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="staff">Staff / principal</option>
            </select>
          </div>
          <div>
            <Label htmlFor="salary">Minimum salary (CAD)</Label>
            <Input
              id="salary"
              inputMode="numeric"
              placeholder="140000"
              value={prefs.minimumSalaryCad ?? ""}
              onChange={(event) => {
                const raw = event.target.value.trim();
                setPrefs((current) => ({
                  ...current,
                  minimumSalaryCad: raw === "" ? null : Number(raw),
                }));
              }}
            />
          </div>
          <div>
            <Label htmlFor="min-fit">Minimum fit to show</Label>
            <Input
              id="min-fit"
              inputMode="numeric"
              value={prefs.minFitToShow}
              onChange={(event) => {
                const raw = Number(event.target.value);
                setPrefs((current) => ({
                  ...current,
                  minFitToShow: Number.isNaN(raw) ? current.minFitToShow : raw,
                }));
              }}
            />
          </div>
          <div>
            <Label htmlFor="digest-min">Digest minimum</Label>
            <Input
              id="digest-min"
              inputMode="numeric"
              value={prefs.digestMinFit}
              onChange={(event) => {
                const raw = Number(event.target.value);
                setPrefs((current) => ({
                  ...current,
                  digestMinFit: Number.isNaN(raw) ? current.digestMinFit : raw,
                }));
              }}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="gta-cities">GTA cities</Label>
          <textarea
            id="gta-cities"
            className="mt-1 min-h-24 w-full rounded-md border border-input px-3 py-2 text-sm"
            value={citiesText}
            onChange={(event) => setCitiesText(event.target.value)}
          />
        </div>
        <div className="space-y-2 text-sm">
          <PreferenceCheck
            checked={prefs.includeHybridGta}
            onChange={() => toggle("includeHybridGta")}
            label="Include hybrid roles in the GTA"
          />
          <PreferenceCheck
            checked={prefs.includeOnsiteGta}
            onChange={() => toggle("includeOnsiteGta")}
            label="Include on-site roles in the GTA"
          />
          <PreferenceCheck
            checked={prefs.showRemoteOther}
            onChange={() => toggle("showRemoteOther")}
            label="Show US-only and other remote roles"
          />
          <PreferenceCheck
            checked={prefs.showOutOfArea}
            onChange={() => toggle("showOutOfArea")}
            label="Show out-of-area roles"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Curated boards have their own setting. Saving titles and location rules does not change
          which companies are included.
        </p>
        <Button
          type="button"
          loading={pending}
          onClick={() => {
            setPending(true);
            saveSearchPreferences({
              targetTitles: titlesText,
              preferredSeniority: prefs.preferredSeniority,
              minimumSalaryCad: prefs.minimumSalaryCad,
              minFitToShow: prefs.minFitToShow,
              digestMinFit: prefs.digestMinFit,
              includeHybridGta: prefs.includeHybridGta,
              includeOnsiteGta: prefs.includeOnsiteGta,
              showRemoteOther: prefs.showRemoteOther,
              showOutOfArea: prefs.showOutOfArea,
              gtaCities: citiesText,
            })
              .then(() => {
                router.refresh();
                toast({ title: "Preferences saved" });
              })
              .catch((error: unknown) => {
                toast({
                  title: "Could not save preferences",
                  description: error instanceof Error ? error.message : "Unknown error",
                  variant: "destructive",
                });
              })
              .finally(() => setPending(false));
          }}
        >
          {pending ? "Saving..." : "Save preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PreferenceCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
