"use client";

import { useEffect, useState } from "react";
import { getCurrentProfileForReview } from "@/server/actions";
import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";
import {
  LOW_CONFIDENCE_THRESHOLD,
  PROFILE_SECTIONS,
  parsedSectionSummary,
  sectionSummary,
  type ProfileSectionKey,
  type ProfileSnapshot,
} from "@/modules/resumes/review/profile-snapshot";

const SECTION_LABELS: Record<ProfileSectionKey, string> = {
  contact: "Contact",
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  certifications: "Certifications",
  projects: "Projects",
};

function sectionConfidence(parsed: ParsedResume, section: ProfileSectionKey): number | null {
  if (section === "projects") return null;
  return parsed.confidence[section];
}

export function ProfileDiffPanel({
  parsed,
  acceptedSections,
  onAcceptedSectionsChange,
}: {
  parsed: ParsedResume;
  acceptedSections: ProfileSectionKey[];
  onAcceptedSectionsChange: (sections: ProfileSectionKey[]) => void;
}) {
  const [current, setCurrent] = useState<ProfileSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentProfileForReview()
      .then((profile) => {
        if (!cancelled) setCurrent(profile);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load the current profile.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(section: ProfileSectionKey) {
    const next = acceptedSections.includes(section)
      ? acceptedSections.filter((item) => item !== section)
      : [...acceptedSections, section];
    onAcceptedSectionsChange(next);
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <h2 className="text-sm font-medium">Compare with current profile</h2>
        <p className="text-xs text-muted-foreground">
          Accept the sections to apply. Unchecked sections stay as they are. Low-confidence items are highlighted.
        </p>
      </div>
      {loadError && <p className="text-xs text-amber-700">{loadError}</p>}
      {PROFILE_SECTIONS.map((section) => {
        const confidence = sectionConfidence(parsed, section);
        const low = confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD;
        const accepted = acceptedSections.includes(section);
        return (
          <section
            key={section}
            className={`rounded-md border p-3 ${low ? "border-amber-400 bg-amber-50/60" : "border-border"}`}
          >
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={accepted}
                onChange={() => toggle(section)}
              />
              {SECTION_LABELS[section]}
              {low && (
                <span className="text-xs font-normal text-amber-700">
                  Low confidence ({Math.round((confidence ?? 0) * 100)}%)
                </span>
              )}
            </label>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Current</p>
                <pre className="mt-1 whitespace-pre-wrap text-xs">
                  {current ? sectionSummary(section, current) : "Loading…"}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Parsed</p>
                <pre className="mt-1 whitespace-pre-wrap text-xs">{parsedSectionSummary(section, parsed)}</pre>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
