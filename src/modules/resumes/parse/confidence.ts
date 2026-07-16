import type { ParsedResume, ParseWarning, ConfidenceScores } from "@/modules/resumes/schema/resume-schema";

export function computeConfidenceScores(
  resume: ParsedResume,
  warnings: ParseWarning[]
): ConfidenceScores {
  const warningPenalty = Math.min(warnings.length * 0.05, 0.35);

  const contactFields = [
    resume.contact.fullName,
    resume.contact.email,
    resume.contact.phone,
    resume.contact.location,
  ].filter(Boolean).length;
  const contact = Math.max(0, Math.min(1, contactFields / 3 - warningPenalty));

  const summary = resume.professionalSummary
    ? Math.max(0.5, 0.85 - warningPenalty)
    : 0.3;

  const skills =
    resume.skillGroups.length > 0
      ? Math.max(0.4, Math.min(1, resume.skillGroups.reduce((n, g) => n + g.skills.length, 0) / 10))
      : 0.2;

  const experience =
    resume.experience.length > 0
      ? Math.max(
          0.4,
          Math.min(
            1,
            resume.experience.reduce((n, e) => n + (e.achievements.length > 0 ? 1 : 0.5), 0) /
              resume.experience.length
          ) - warningPenalty
        )
      : 0.2;

  const education = resume.education.length > 0 ? 0.75 - warningPenalty : 0.3;
  const certifications =
    resume.certifications.length > 0 ? 0.75 - warningPenalty : 0.3;

  const overall = Math.max(
    0,
    (contact + summary + skills + experience + education + certifications) / 6 - warningPenalty
  );

  return {
    overall: roundScore(overall),
    contact: roundScore(contact),
    summary: roundScore(summary),
    skills: roundScore(skills),
    experience: roundScore(experience),
    education: roundScore(education),
    certifications: roundScore(certifications),
  };
}

function roundScore(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
}

export function mergeWarnings(
  ...groups: ParseWarning[][]
): ParseWarning[] {
  const seen = new Set<string>();
  const result: ParseWarning[] = [];
  for (const group of groups) {
    for (const w of group) {
      const key = `${w.code}:${w.fieldPath}:${w.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(w);
    }
  }
  return result;
}
