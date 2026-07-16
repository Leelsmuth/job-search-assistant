"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ProfileExtraction } from "@/modules/ai/client";
import {
  skillsFromCommaString,
  skillsToCommaString,
} from "@/modules/resumes/profile-extraction-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProfileExtractionReviewFormProps = {
  value: ProfileExtraction;
  onChange: (value: ProfileExtraction) => void;
};

export function ProfileExtractionReviewForm({
  value,
  onChange,
}: ProfileExtractionReviewFormProps) {
  const experiences = value.experiences ?? [];

  function updateExperience(index: number, patch: Partial<ProfileExtraction["experiences"][number]>) {
    const next = experiences.map((exp, i) => (i === index ? { ...exp, ...patch } : exp));
    onChange({ ...value, experiences: next });
  }

  function updateBullet(expIndex: number, bulletIndex: number, text: string) {
    const exp = experiences[expIndex];
    const bullets = [...(exp.bullets ?? [])];
    bullets[bulletIndex] = text;
    updateExperience(expIndex, { bullets });
  }

  function addBullet(expIndex: number) {
    const exp = experiences[expIndex];
    updateExperience(expIndex, { bullets: [...(exp.bullets ?? []), ""] });
  }

  function removeBullet(expIndex: number, bulletIndex: number) {
    const exp = experiences[expIndex];
    const bullets = (exp.bullets ?? []).filter((_, i) => i !== bulletIndex);
    updateExperience(expIndex, { bullets });
  }

  function addExperience() {
    onChange({
      ...value,
      experiences: [
        ...experiences,
        { company: "", title: "", bullets: [""] },
      ],
    });
  }

  function removeExperience(index: number) {
    onChange({
      ...value,
      experiences: experiences.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="displayName">Name</Label>
            <Input
              id="displayName"
              value={value.displayName ?? ""}
              onChange={(e) => onChange({ ...value, displayName: e.target.value })}
              placeholder="Your name"
            />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={value.location ?? ""}
              onChange={(e) => onChange({ ...value, location: e.target.value })}
              placeholder="City, Country"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              rows={4}
              value={value.summary ?? ""}
              onChange={(e) => onChange({ ...value, summary: e.target.value })}
              placeholder="Professional summary"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="skills">Skills (comma-separated)</Label>
            <Input
              id="skills"
              value={skillsToCommaString(value.skills)}
              onChange={(e) =>
                onChange({ ...value, skills: skillsFromCommaString(e.target.value) })
              }
              placeholder="React, TypeScript, Node.js"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Work experience</h2>
        <Button type="button" variant="outline" size="sm" onClick={addExperience}>
          <Plus className="mr-1 h-4 w-4" />
          Add role
        </Button>
      </div>

      {experiences.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No roles were extracted. Add one manually or re-upload your resume.
        </p>
      )}

      {experiences.map((exp, expIndex) => (
        <Card key={expIndex}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Role {expIndex + 1}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => removeExperience(expIndex)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove role</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Company</Label>
                <Input
                  value={exp.company}
                  onChange={(e) => updateExperience(expIndex, { company: e.target.value })}
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={exp.title}
                  onChange={(e) => updateExperience(expIndex, { title: e.target.value })}
                />
              </div>
              <div>
                <Label>Start date</Label>
                <Input
                  value={exp.startDate ?? ""}
                  onChange={(e) => updateExperience(expIndex, { startDate: e.target.value })}
                  placeholder="Jan 2020"
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  value={exp.endDate ?? ""}
                  onChange={(e) => updateExperience(expIndex, { endDate: e.target.value })}
                  placeholder="Present"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Achievement bullets</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addBullet(expIndex)}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add bullet
                </Button>
              </div>
              {(exp.bullets ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No bullets for this role. Add achievement statements — not headers or contact lines.
                </p>
              )}
              {(exp.bullets ?? []).map((bullet, bulletIndex) => (
                <div key={bulletIndex} className="flex gap-2">
                  <Textarea
                    rows={2}
                    value={bullet}
                    onChange={(e) => updateBullet(expIndex, bulletIndex, e.target.value)}
                    placeholder="Led migration to Next.js, reducing page load by 40%"
                    className="min-h-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeBullet(expIndex, bulletIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove bullet</span>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
