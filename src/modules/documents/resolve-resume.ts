import type {
  ChangeDecision,
  ResolvedResume,
  ResumePreview,
  TailoredResumeDraft,
} from "@/modules/documents/types";

function decisionFor(draft: TailoredResumeDraft, id: string): ChangeDecision | null {
  return draft.changes.find((change) => change.id === id)?.decision ?? null;
}

function includeProposed(
  proposedIncluded: boolean,
  omitId: string,
  draft: TailoredResumeDraft
): boolean {
  if (proposedIncluded) return true;
  return decisionFor(draft, omitId) === "rejected";
}

function restoreOriginalOrder(draft: TailoredResumeDraft, reorderId: string): boolean {
  const decision = decisionFor(draft, reorderId);
  return decision !== "pending" && decision !== "accepted";
}

function sortBy<T extends { originalIndex: number; proposedIndex: number }>(
  items: T[],
  restoreOriginal: boolean
): T[] {
  return [...items].sort((a, b) => {
    if (restoreOriginal) return a.originalIndex - b.originalIndex;
    return a.proposedIndex - b.proposedIndex || a.originalIndex - b.originalIndex;
  });
}

function bulletText(
  bullet: TailoredResumeDraft["experiences"][number]["bullets"][number],
  draft: TailoredResumeDraft
): string {
  const decision = decisionFor(draft, `rewrite-bullet:${bullet.id}`);
  if (decision === "rejected") return bullet.originalText;
  if (bullet.editedText != null && bullet.editedText.trim()) return bullet.editedText;
  if (decision && bullet.suggestedText.trim()) return bullet.suggestedText;
  return bullet.originalText;
}

function dateRange(start: string | null, end: string | null): string | null {
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

export function buildResumePreview(
  draft: TailoredResumeDraft,
  yearsExperience: number | null = null
): ResumePreview {
  const experiences = sortBy(
    draft.experiences.filter((experience) =>
      includeProposed(experience.proposedIncluded, `omit-experience:${experience.id}`, draft)
    ),
    restoreOriginalOrder(draft, "reorder-experiences")
  ).map((experience) => {
    const bullets = sortBy(
      experience.bullets.filter((bullet) =>
        includeProposed(bullet.proposedIncluded, `omit-bullet:${bullet.id}`, draft)
      ),
      restoreOriginalOrder(draft, `reorder-bullets:${experience.id}`)
    );
    const meta = [dateRange(experience.startDate, experience.endDate), experience.location]
      .filter(Boolean)
      .join(" · ");
    return {
      id: experience.id,
      heading: `${experience.title} — ${experience.company}`,
      meta,
      bullets: bullets.map((bullet) => ({
        id: bullet.id,
        text: bulletText(bullet, draft),
        unsupportedClaims: bullet.unsupportedClaims,
      })),
    };
  });

  const skills = sortBy(
    draft.skills.filter((skill) => includeProposed(skill.proposedIncluded, `omit-skill:${skill.id}`, draft)),
    restoreOriginalOrder(draft, "reorder-skills")
  ).map((skill) => skill.name);

  const projects = sortBy(
    draft.projects.filter((project) =>
      includeProposed(project.proposedIncluded, `omit-project:${project.id}`, draft)
    ),
    restoreOriginalOrder(draft, "reorder-projects")
  ).map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    skills: project.skills,
  }));

  return {
    summary: draft.summary,
    experiences,
    projects,
    skills,
    education: draft.education.map((item) => ({
      id: item.id,
      line: [item.degree, item.field, item.institution, item.endDate].filter(Boolean).join(", "),
    })),
    certifications: draft.certifications.map((item) => ({
      id: item.id,
      line: item.issuer ? `${item.name} — ${item.issuer}` : item.name,
    })),
    ...(yearsExperience == null ? {} : {}),
  };
}

export function resolveTailoredResume(
  draft: TailoredResumeDraft,
  yearsExperience: number | null = null
): ResolvedResume {
  const preview = buildResumePreview(draft, yearsExperience);
  return {
    header: { ...draft.header, yearsExperience },
    summary: preview.summary,
    experiences: preview.experiences.map((experience) => {
      const source = draft.experiences.find((item) => item.id === experience.id);
      return {
        company: source?.company ?? "",
        title: source?.title ?? "",
        startDate: source?.startDate ?? null,
        endDate: source?.endDate ?? null,
        location: source?.location ?? null,
        bullets: experience.bullets.map((bullet) => bullet.text),
      };
    }),
    projects: preview.projects.map((project) => ({
      name: project.name,
      description: project.description,
      skills: project.skills,
    })),
    skills: preview.skills,
    education: draft.education.map((item) => ({
      institution: item.institution,
      degree: item.degree,
      field: item.field,
      endDate: item.endDate,
    })),
    certifications: draft.certifications.map((item) => ({
      name: item.name,
      issuer: item.issuer,
    })),
  };
}

export function masterResumeFromDraft(draft: TailoredResumeDraft): ResolvedResume {
  return {
    header: { ...draft.header, yearsExperience: null },
    summary: draft.summaryBaseline,
    experiences: [...draft.experiences]
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .map((experience) => ({
        company: experience.company,
        title: experience.title,
        startDate: experience.startDate,
        endDate: experience.endDate,
        location: experience.location,
        bullets: [...experience.bullets]
          .sort((a, b) => a.originalIndex - b.originalIndex)
          .map((bullet) => bullet.originalText),
      })),
    projects: [...draft.projects]
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .map((project) => ({
        name: project.name,
        description: project.description,
        skills: project.skills,
      })),
    skills: [...draft.skills]
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .map((skill) => skill.name),
    education: draft.education.map((item) => ({
      institution: item.institution,
      degree: item.degree,
      field: item.field,
      endDate: item.endDate,
    })),
    certifications: draft.certifications.map((item) => ({
      name: item.name,
      issuer: item.issuer,
    })),
  };
}

export function setChangeDecision(
  draft: TailoredResumeDraft,
  changeId: string,
  decision: ChangeDecision
): TailoredResumeDraft {
  const change = draft.changes.find((item) => item.id === changeId);
  if (!change) return draft;
  let experiences = draft.experiences;
  if (change.kind === "rewrite_bullet" && decision === "rejected") {
    const bulletId = change.targetIds[0];
    experiences = experiences.map((experience) => ({
      ...experience,
      bullets: experience.bullets.map((bullet) =>
        bullet.id === bulletId ? { ...bullet, editedText: null } : bullet
      ),
    }));
  }
  return {
    ...draft,
    experiences,
    changes: draft.changes.map((item) => (item.id === changeId ? { ...item, decision } : item)),
  };
}

export function setAllDecisions(
  draft: TailoredResumeDraft,
  decision: ChangeDecision
): TailoredResumeDraft {
  return {
    ...draft,
    experiences:
      decision === "rejected"
        ? draft.experiences.map((experience) => ({
            ...experience,
            bullets: experience.bullets.map((bullet) => ({ ...bullet, editedText: null })),
          }))
        : draft.experiences,
    changes: draft.changes.map((change) => ({ ...change, decision })),
  };
}

export function setBulletText(
  draft: TailoredResumeDraft,
  bulletId: string,
  text: string
): TailoredResumeDraft {
  const rewriteId = `rewrite-bullet:${bulletId}`;
  let original = "";
  const experiences = draft.experiences.map((experience) => ({
    ...experience,
    bullets: experience.bullets.map((bullet) => {
      if (bullet.id !== bulletId) return bullet;
      original = bullet.originalText;
      return { ...bullet, editedText: text };
    }),
  }));
  const changes = draft.changes.map((change) => {
    if (change.id !== rewriteId) return change;
    return {
      ...change,
      decision: text.trim() === original.trim() ? ("rejected" as const) : ("accepted" as const),
    };
  });
  return { ...draft, experiences, changes };
}

export function setSummary(draft: TailoredResumeDraft, summary: string): TailoredResumeDraft {
  return { ...draft, summary };
}
