import type { ProfileExtraction } from "@/modules/ai/client";

export function sanitizeProfileExtraction(input: ProfileExtraction): ProfileExtraction {
  return {
    ...input,
    skills: (input.skills ?? []).filter((s) => s.name.trim().length > 0),
    experiences: (input.experiences ?? [])
      .map((exp) => ({
        ...exp,
        company: exp.company.trim(),
        title: exp.title.trim(),
        bullets: (exp.bullets ?? []).map((b) => b.trim()).filter(Boolean),
      }))
      .filter((exp) => exp.company.length > 0 || exp.title.length > 0),
    projects: input.projects ?? [],
    education: input.education ?? [],
    targetTitles: (input.targetTitles ?? []).filter((t) => t.trim().length > 0),
  };
}

export function skillsToCommaString(skills: ProfileExtraction["skills"] | undefined): string {
  return skills?.map((s) => s.name).join(", ") ?? "";
}

export function skillsFromCommaString(value: string): ProfileExtraction["skills"] {
  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, category: "other" }));
}

export function emptyProfileExtraction(): ProfileExtraction {
  return {
    skills: [],
    experiences: [],
    projects: [],
    education: [],
    targetTitles: [],
  };
}
