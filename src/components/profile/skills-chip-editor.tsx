"use client";

import { useState } from "react";
import { sanitizeSkills } from "@/modules/candidate/sanitize-skills";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function SkillsChipEditor({
  skills,
  onChange,
  id = "skills",
}: {
  skills: string[];
  onChange: (skills: string[]) => void;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function addSkill() {
    const next = sanitizeSkills([...skills, draft]);
    if (draft.trim() && next.length === skills.length) {
      setHint("That isn’t a recognized technology. Use a name like React or TypeScript.");
      return;
    }
    setHint(null);
    setDraft("");
    onChange(next);
  }

  return (
    <div className="sm:col-span-2">
      <Label htmlFor={id}>Skills</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Technologies only. Resume sentences and company names are dropped.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {skills.length === 0 ? (
          <span className="text-sm text-muted-foreground">No skills yet.</span>
        ) : (
          skills.map((skill) => (
            <button
              key={skill}
              type="button"
              className="rounded-full border border-border bg-secondary px-3 py-1 text-xs"
              onClick={() => onChange(skills.filter((item) => item !== skill))}
            >
              {skill} <span aria-hidden="true">×</span>
              <span className="sr-only">Remove {skill}</span>
            </button>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder="Add a skill, like Next.js"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addSkill();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addSkill}>
          Add
        </Button>
      </div>
      {hint ? <p className="mt-2 text-xs text-amber-800">{hint}</p> : null}
    </div>
  );
}
