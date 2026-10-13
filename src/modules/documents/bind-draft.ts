import { z } from "zod";
import { reviewBulletRewrite, reviewCoverLetter, profileCorpus } from "@/modules/documents/grounding";
import { resolveTailoredResume } from "@/modules/documents/resolve-resume";
import type {
  ChangeDecision,
  ProfileSnapshot,
  ResolvedResume,
  ResumeChange,
  TailoredResumeDraft,
} from "@/modules/documents/types";

const decisionSchema = z.enum(["pending", "accepted", "rejected"]);

const draftSchema = z.object({
  generatedAt: z.string().max(40),
  generationMode: z.enum(["deterministic", "llm"]),
  model: z.string().max(80).nullable(),
  jobTitle: z.string().max(200),
  companyName: z.string().max(200).nullable(),
  header: z.object({
    name: z.string().max(200),
    location: z.string().max(200).nullable(),
    headline: z.string().max(200).nullable(),
  }),
  summary: z.string().max(5000).nullable(),
  summaryBaseline: z.string().max(5000).nullable(),
  experiences: z.array(z.object({
    id: z.string().min(1).max(80),
    company: z.string().max(200),
    title: z.string().max(200),
    startDate: z.string().max(40).nullable(),
    endDate: z.string().max(40).nullable(),
    location: z.string().max(200).nullable(),
    originalIndex: z.number().int(),
    proposedIndex: z.number().int(),
    proposedIncluded: z.boolean(),
    score: z.number(),
    bullets: z.array(z.object({
      id: z.string().min(1).max(80),
      originalText: z.string().max(4000),
      suggestedText: z.string().max(4000),
      editedText: z.string().max(4000).nullable(),
      proposedIncluded: z.boolean(),
      originalIndex: z.number().int(),
      proposedIndex: z.number().int(),
      score: z.number(),
      matchedTerms: z.array(z.string().max(80)).max(40),
      unsupportedClaims: z.array(z.string().max(300)).max(12),
    })).max(40),
  })).max(40),
  projects: z.array(z.object({
    id: z.string().min(1).max(80),
    name: z.string().max(200),
    description: z.string().max(4000).nullable(),
    skills: z.array(z.string().max(80)).max(40),
    originalIndex: z.number().int(),
    proposedIndex: z.number().int(),
    proposedIncluded: z.boolean(),
    score: z.number(),
    matchedTerms: z.array(z.string().max(80)).max(40),
  })).max(40),
  skills: z.array(z.object({
    id: z.string().min(1).max(80),
    name: z.string().max(120),
    originalIndex: z.number().int(),
    proposedIndex: z.number().int(),
    proposedIncluded: z.boolean(),
    score: z.number(),
    matchedTerms: z.array(z.string().max(80)).max(20),
  })).max(80),
  education: z.array(z.object({
    id: z.string().min(1).max(80),
    institution: z.string().max(200),
    degree: z.string().max(200).nullable(),
    field: z.string().max(200).nullable(),
    startDate: z.string().max(40).nullable(),
    endDate: z.string().max(40).nullable(),
  })).max(20),
  certifications: z.array(z.object({
    id: z.string().min(1).max(80),
    name: z.string().max(200),
    issuer: z.string().max(200).nullable(),
  })).max(20),
  changes: z.array(z.object({
    id: z.string().min(1).max(200),
    kind: z.enum([
      "reorder_experiences",
      "omit_experience",
      "reorder_bullets",
      "omit_bullet",
      "rewrite_bullet",
      "reorder_skills",
      "omit_skill",
      "reorder_projects",
      "omit_project",
    ]),
    label: z.string().max(300),
    before: z.string().max(2000),
    after: z.string().max(2000),
    decision: decisionSchema,
    targetIds: z.array(z.string().max(80)).max(40),
  })).max(200),
  unsupportedClaims: z.array(z.string().max(300)).max(40),
});

export function parseTailoredResumeDraft(input: unknown): TailoredResumeDraft {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("This resume draft is invalid. Generate it again.");
  }
  return parsed.data;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function bindTailoredDraft(
  input: TailoredResumeDraft,
  profile: ProfileSnapshot,
  job: { title: string; companyName: string | null }
): { draft: TailoredResumeDraft; resolved: ResolvedResume; warnings: string[] } {
  const warnings: string[] = [];
  const experiencesById = new Map(profile.experiences.map((experience) => [experience.id, experience]));
  const skillsById = new Map(profile.skills.map((skill) => [skill.id, skill]));
  const projectsById = new Map(profile.projects.map((project) => [project.id, project]));
  const educationById = new Map(profile.education.map((item) => [item.id, item]));
  const certificationsById = new Map(profile.certifications.map((item) => [item.id, item]));

  const experiences = input.experiences.flatMap((incoming) => {
    const source = experiencesById.get(incoming.id);
    if (!source) return [];
    const originalIndex = profile.experiences.findIndex((experience) => experience.id === source.id);
    const bullets = incoming.bullets.flatMap((bullet) => {
      const original = source.bullets.find((item) => item.id === bullet.id);
      if (!original) return [];
      const evidence = {
        bullet: original.text,
        company: source.company,
        title: source.title,
        startDate: source.startDate,
        endDate: source.endDate,
        otherCompanies: profile.experiences
          .filter((item) => item.id !== source.id)
          .map((item) => item.company),
      };
      let suggested = original.text;
      if (bullet.suggestedText.trim() && bullet.suggestedText.trim() !== original.text.trim()) {
        const review = reviewBulletRewrite(bullet.suggestedText, evidence);
        if (review.grounded) suggested = review.text;
        else warnings.push(...review.unsupportedClaims.map((claim) => `${source.company}: ${claim}`));
      }
      let edited: string | null = null;
      if (bullet.editedText && bullet.editedText.trim() && bullet.editedText.trim() !== original.text.trim()) {
        const review = reviewBulletRewrite(bullet.editedText, evidence);
        if (review.grounded) edited = review.text;
        else warnings.push(...review.unsupportedClaims.map((claim) => `Edit reverted: ${claim}`));
      }
      return [{
        ...bullet,
        originalText: original.text,
        suggestedText: suggested,
        editedText: edited,
        originalIndex: source.bullets.findIndex((item) => item.id === original.id),
        unsupportedClaims: [],
      }];
    });
    return [{
      ...incoming,
      company: source.company,
      title: source.title,
      startDate: source.startDate,
      endDate: source.endDate,
      location: source.location,
      originalIndex,
      bullets,
    }];
  });

  const skills = input.skills.flatMap((skill) => {
    const source = skillsById.get(skill.id);
    if (!source) return [];
    return [{
      ...skill,
      name: source.name,
      originalIndex: profile.skills.findIndex((item) => item.id === source.id),
    }];
  });

  const projects = input.projects.flatMap((project) => {
    const source = projectsById.get(project.id);
    if (!source) return [];
    return [{
      ...project,
      name: source.name,
      description: source.description,
      skills: source.skills,
      originalIndex: profile.projects.findIndex((item) => item.id === source.id),
    }];
  });

  let summary = profile.summary;
  if (input.summary && input.summary.trim() !== (profile.summary ?? "").trim()) {
    const review = reviewCoverLetter(input.summary, profileCorpus(profile), {
      organizations: profile.experiences.map((experience) => experience.company),
      titles: profile.experiences.map((experience) => experience.title),
      jobTitle: job.title,
    });
    if (review.grounded) summary = input.summary.trim();
    else warnings.push(...review.unsupportedClaims.map((claim) => `Summary reverted: ${claim}`));
  }

  const knownIds = new Set<string>([
    "reorder-experiences",
    "reorder-skills",
    "reorder-projects",
    ...experiences.flatMap((experience) => [
      `omit-experience:${experience.id}`,
      `reorder-bullets:${experience.id}`,
      ...experience.bullets.flatMap((bullet) => [`omit-bullet:${bullet.id}`, `rewrite-bullet:${bullet.id}`]),
    ]),
    ...skills.map((skill) => `omit-skill:${skill.id}`),
    ...projects.map((project) => `omit-project:${project.id}`),
  ]);

  const decisions = new Map(input.changes.map((change) => [change.id, change.decision]));
  const changes: ResumeChange[] = input.changes
    .filter((change) => knownIds.has(change.id))
    .map((change) => ({ ...change, decision: decisions.get(change.id) ?? "pending" }));

  for (const experience of experiences) {
    for (const bullet of experience.bullets) {
      const id = `rewrite-bullet:${bullet.id}`;
      const differs = bullet.suggestedText.trim() !== bullet.originalText.trim();
      const existing = changes.find((change) => change.id === id);
      if (differs && !existing) {
        changes.push({
          id,
          kind: "rewrite_bullet",
          label: `Rewrite bullet at ${experience.company}`,
          before: bullet.originalText,
          after: bullet.suggestedText,
          decision: (decisions.get(id) ?? "pending") as ChangeDecision,
          targetIds: [bullet.id],
        });
      }
      if (!differs && existing && !bullet.editedText) {
        const index = changes.findIndex((change) => change.id === id);
        if (index >= 0) changes.splice(index, 1);
      }
    }
  }

  const draft: TailoredResumeDraft = {
    ...input,
    generationMode: input.generationMode,
    model: input.model,
    jobTitle: job.title,
    companyName: job.companyName,
    header: {
      name: profile.displayName?.trim() || "Resume",
      location: profile.location,
      headline: profile.targetTitles[0] ?? null,
    },
    summary,
    summaryBaseline: profile.summary,
    experiences,
    skills,
    projects,
    education: profile.education
      .filter((item) => educationById.has(item.id))
      .map((item) => ({
        id: item.id,
        institution: item.institution,
        degree: item.degree,
        field: item.field,
        startDate: item.startDate,
        endDate: item.endDate,
      })),
    certifications: profile.certifications
      .filter((item) => certificationsById.has(item.id))
      .map((item) => ({ id: item.id, name: item.name, issuer: item.issuer })),
    changes,
    unsupportedClaims: unique(warnings),
  };

  return {
    draft,
    resolved: resolveTailoredResume(draft, profile.yearsExperience),
    warnings: draft.unsupportedClaims,
  };
}
