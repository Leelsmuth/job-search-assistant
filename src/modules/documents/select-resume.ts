import { reviewBulletRewrite, type BulletEvidence } from "@/modules/documents/grounding";
import { clipText, tokenize } from "@/modules/documents/text";
import type {
  JobTailoringContext,
  ProfileSnapshot,
  ResumeChange,
  TailoredBullet,
  TailoredExperience,
  TailoredProject,
  TailoredResumeDraft,
  TailoredSkill,
} from "@/modules/documents/types";

const MAX_EXPERIENCES = 4;
const MAX_BULLETS = 5;
const MIN_BULLETS = 2;
const MAX_SKILLS = 12;
const MAX_PROJECTS = 3;

type Scored = { score: number; originalIndex: number; id: string };

function singularKeys(token: string): string[] {
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
    return [token, token.slice(0, -1)];
  }
  return [token];
}

export function buildTermWeights(job: JobTailoringContext): Map<string, number> {
  const weights = new Map<string, number>();

  const add = (text: string | null | undefined, weight: number) => {
    if (!text || weight === 0) return;
    const seen = new Set<string>();
    for (const token of tokenize(text)) {
      for (const key of singularKeys(token)) {
        if (seen.has(key)) continue;
        seen.add(key);
        weights.set(key, (weights.get(key) ?? 0) + weight);
      }
    }
  };

  for (const requirement of job.requirements) {
    const importance = requirement.importance === "preferred" ? 2 : 4;
    add(requirement.text, importance);
    add(requirement.normalizedSkill, importance + 1);
  }
  for (const match of job.requirementMatches) {
    const bonus =
      match.matchStatus === "confirmed" ? 5 : match.matchStatus === "transferable" ? 2 : 0;
    add(match.requirementText, bonus);
    add(match.normalizedSkill, bonus);
  }
  for (const technology of job.technologies) add(technology, 5);
  for (const responsibility of job.responsibilities) add(responsibility, 2);
  for (const qualification of job.requiredQualifications) add(qualification, 3);
  for (const qualification of job.preferredQualifications) add(qualification, 2);
  for (const reason of job.frontendFitReasons) add(reason, 3);
  add(job.title, 3);
  add(job.description, 1);
  return weights;
}

export function scoreAgainstJob(
  text: string,
  weights: Map<string, number>,
  fitTokens: Set<string>
): { score: number; matchedTerms: string[] } {
  const matched = new Set<string>();
  let score = 0;
  for (const token of tokenize(text)) {
    for (const key of singularKeys(token)) {
      const weight = weights.get(key);
      if (!weight || matched.has(key)) continue;
      matched.add(key);
      score += weight;
      if (fitTokens.has(key) || fitTokens.has(token)) score += 2;
    }
  }
  return { score, matchedTerms: [...matched].sort() };
}

function evidenceBonus(bulletText: string, job: JobTailoringContext): number {
  const bullet = bulletText.trim().toLowerCase();
  let bonus = 0;
  for (const match of job.requirementMatches) {
    const evidence = match.evidenceText?.trim().toLowerCase();
    if (!evidence) continue;
    const aligned = bullet === evidence || bullet.includes(evidence) || evidence.includes(bullet);
    if (!aligned) continue;
    const confidence = match.confidence ?? 0.6;
    if (match.matchStatus === "confirmed") bonus += 10 * confidence;
    else if (match.matchStatus === "transferable") bonus += 5 * confidence;
  }
  return bonus;
}

function byScore(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.originalIndex - b.originalIndex;
}

function selectionFlags<T extends Scored>(
  items: T[],
  max: number,
  min: number,
  keepOriginalWhenNoneMatch: boolean
): Map<string, { proposedIncluded: boolean; proposedIndex: number }> {
  const ranked = [...items].sort(byScore);
  const flags = new Map<string, { proposedIncluded: boolean; proposedIndex: number }>();
  const anyPositive = ranked.some((item) => item.score > 0);

  if (!anyPositive) {
    ranked.forEach((item, index) => {
      flags.set(item.id, {
        proposedIndex: keepOriginalWhenNoneMatch ? item.originalIndex : index,
        proposedIncluded: keepOriginalWhenNoneMatch
          ? item.originalIndex < Math.min(max, items.length)
          : false,
      });
    });
    return flags;
  }

  const chosen = new Set<string>();
  for (const item of ranked) {
    if (chosen.size >= max) break;
    if (item.score > 0) chosen.add(item.id);
  }
  if (chosen.size < min) {
    for (const item of [...ranked].sort((a, b) => a.originalIndex - b.originalIndex)) {
      if (chosen.size >= min) break;
      chosen.add(item.id);
    }
  }
  ranked.forEach((item, index) => {
    flags.set(item.id, { proposedIndex: index, proposedIncluded: chosen.has(item.id) });
  });
  return flags;
}

function orderChanged(
  items: Array<{ id: string; originalIndex: number; proposedIndex: number; proposedIncluded: boolean }>
): boolean {
  const included = items.filter((item) => item.proposedIncluded);
  if (included.length < 2) return false;
  const original = [...included].sort((a, b) => a.originalIndex - b.originalIndex).map((item) => item.id);
  const proposed = [...included]
    .sort((a, b) => a.proposedIndex - b.proposedIndex || a.originalIndex - b.originalIndex)
    .map((item) => item.id);
  return original.some((id, index) => id !== proposed[index]);
}

function listLabel(items: string[]): string {
  if (items.length === 0) return "None";
  return clipText(items.map((item, index) => `${index + 1}. ${item}`).join("; "), 240);
}

export function selectTailoredResume(
  profile: ProfileSnapshot,
  job: JobTailoringContext
): TailoredResumeDraft {
  const weights = buildTermWeights(job);
  const fitTokens = new Set(job.frontendFitReasons.flatMap((reason) => tokenize(reason)));
  const changes: ResumeChange[] = [];

  const experiences: TailoredExperience[] = profile.experiences.map((experience, originalIndex) => {
    const bulletScores = experience.bullets.map((bullet, bulletIndex) => {
      const text = [bullet.text, bullet.impact ?? "", ...(bullet.skills ?? [])].join(" ");
      const scored = scoreAgainstJob(text, weights, fitTokens);
      return {
        id: bullet.id,
        originalText: bullet.text,
        suggestedText: bullet.text,
        editedText: null,
        originalIndex: bulletIndex,
        score: scored.score + evidenceBonus(bullet.text, job),
        matchedTerms: scored.matchedTerms,
        unsupportedClaims: [] as string[],
      };
    });
    const bulletFlags = selectionFlags(bulletScores, MAX_BULLETS, Math.min(MIN_BULLETS, bulletScores.length), true);
    const bullets: TailoredBullet[] = bulletScores.map((bullet) => {
      const flag = bulletFlags.get(bullet.id) ?? {
        proposedIncluded: true,
        proposedIndex: bullet.originalIndex,
      };
      return { ...bullet, ...flag };
    });
    const titleScore = scoreAgainstJob(
      [experience.title, experience.company, experience.description ?? ""].join(" "),
      weights,
      fitTokens
    );
    const score = titleScore.score * 1.25 + bullets.reduce((sum, bullet) => sum + bullet.score, 0);
    return {
      id: experience.id,
      company: experience.company,
      title: experience.title,
      startDate: experience.startDate,
      endDate: experience.endDate,
      location: experience.location,
      originalIndex,
      proposedIndex: originalIndex,
      proposedIncluded: true,
      score,
      bullets,
    };
  });

  const experienceFlags = selectionFlags(experiences, MAX_EXPERIENCES, 1, true);
  for (const experience of experiences) {
    const flag = experienceFlags.get(experience.id);
    if (!flag) continue;
    experience.proposedIncluded = flag.proposedIncluded;
    experience.proposedIndex = flag.proposedIndex;
  }

  if (orderChanged(experiences)) {
    const included = experiences.filter((experience) => experience.proposedIncluded);
    const before = [...included].sort((a, b) => a.originalIndex - b.originalIndex);
    const after = [...included].sort(
      (a, b) => a.proposedIndex - b.proposedIndex || a.originalIndex - b.originalIndex
    );
    changes.push({
      id: "reorder-experiences",
      kind: "reorder_experiences",
      label: "Reorder experience",
      before: listLabel(before.map((item) => `${item.title} at ${item.company}`)),
      after: listLabel(after.map((item) => `${item.title} at ${item.company}`)),
      decision: "pending",
      targetIds: after.map((item) => item.id),
    });
  }

  for (const experience of experiences) {
    if (!experience.proposedIncluded) {
      changes.push({
        id: `omit-experience:${experience.id}`,
        kind: "omit_experience",
        label: `${experience.title} at ${experience.company}`,
        before: "Included",
        after: "Omitted",
        decision: "pending",
        targetIds: [experience.id],
      });
    }
    if (orderChanged(experience.bullets)) {
      const included = experience.bullets.filter((bullet) => bullet.proposedIncluded);
      changes.push({
        id: `reorder-bullets:${experience.id}`,
        kind: "reorder_bullets",
        label: `Reorder bullets at ${experience.company}`,
        before: listLabel(
          [...included]
            .sort((a, b) => a.originalIndex - b.originalIndex)
            .map((bullet) => bullet.originalText)
        ),
        after: listLabel(
          [...included]
            .sort((a, b) => a.proposedIndex - b.proposedIndex || a.originalIndex - b.originalIndex)
            .map((bullet) => bullet.originalText)
        ),
        decision: "pending",
        targetIds: [experience.id],
      });
    }
    for (const bullet of experience.bullets) {
      if (bullet.proposedIncluded) continue;
      changes.push({
        id: `omit-bullet:${bullet.id}`,
        kind: "omit_bullet",
        label: `Bullet at ${experience.company}`,
        before: clipText(bullet.originalText),
        after: "Omitted",
        decision: "pending",
        targetIds: [bullet.id],
      });
    }
  }

  const skillScores = profile.skills.map((skill, originalIndex) => {
    const scored = scoreAgainstJob(skill.name, weights, fitTokens);
    return { id: skill.id, name: skill.name, originalIndex, ...scored };
  });
  const skillFlags = selectionFlags(skillScores, MAX_SKILLS, 0, true);
  const skills: TailoredSkill[] = skillScores.map((skill) => ({
    ...skill,
    ...(skillFlags.get(skill.id) ?? {
      proposedIncluded: false,
      proposedIndex: skill.originalIndex,
    }),
  }));
  pushCollectionChanges(changes, skills, {
    reorderId: "reorder-skills",
    reorderKind: "reorder_skills",
    reorderLabel: "Reorder skills",
    omitKind: "omit_skill",
    omitId: (skill) => `omit-skill:${skill.id}`,
    label: (skill) => skill.name,
  });

  const projectScores = profile.projects.map((project, originalIndex) => {
    const scored = scoreAgainstJob(
      [project.name, project.description ?? "", project.evidence ?? "", ...project.skills].join(" "),
      weights,
      fitTokens
    );
    return { ...project, originalIndex, ...scored };
  });
  const projectFlags = selectionFlags(projectScores, MAX_PROJECTS, 0, true);
  const projects: TailoredProject[] = projectScores.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    skills: project.skills,
    originalIndex: project.originalIndex,
    score: project.score,
    matchedTerms: project.matchedTerms,
    ...(projectFlags.get(project.id) ?? {
      proposedIncluded: false,
      proposedIndex: project.originalIndex,
    }),
  }));
  pushCollectionChanges(changes, projects, {
    reorderId: "reorder-projects",
    reorderKind: "reorder_projects",
    reorderLabel: "Reorder projects",
    omitKind: "omit_project",
    omitId: (project) => `omit-project:${project.id}`,
    label: (project) => project.name,
  });

  return {
    generatedAt: new Date().toISOString(),
    generationMode: "deterministic",
    model: null,
    jobTitle: job.title,
    companyName: job.companyName,
    header: {
      name: profile.displayName?.trim() || "Resume",
      location: profile.location,
      headline: profile.targetTitles[0] ?? null,
    },
    summary: profile.summary,
    summaryBaseline: profile.summary,
    experiences,
    projects,
    skills,
    education: profile.education.map((item) => ({ ...item })),
    certifications: profile.certifications.map((item) => ({ ...item })),
    changes,
    unsupportedClaims: [],
  };
}

function pushCollectionChanges<T extends { id: string; originalIndex: number; proposedIndex: number; proposedIncluded: boolean }>(
  changes: ResumeChange[],
  items: T[],
  copy: {
    reorderId: string;
    reorderKind: "reorder_skills" | "reorder_projects";
    reorderLabel: string;
    omitKind: "omit_skill" | "omit_project";
    omitId: (item: T) => string;
    label: (item: T) => string;
  }
) {
  if (orderChanged(items)) {
    const included = items.filter((item) => item.proposedIncluded);
    changes.push({
      id: copy.reorderId,
      kind: copy.reorderKind,
      label: copy.reorderLabel,
      before: listLabel(
        [...included].sort((a, b) => a.originalIndex - b.originalIndex).map(copy.label)
      ),
      after: listLabel(
        [...included]
          .sort((a, b) => a.proposedIndex - b.proposedIndex || a.originalIndex - b.originalIndex)
          .map(copy.label)
      ),
      decision: "pending",
      targetIds: included.map((item) => item.id),
    });
  }
  for (const item of items) {
    if (item.proposedIncluded) continue;
    changes.push({
      id: copy.omitId(item),
      kind: copy.omitKind,
      label: copy.label(item),
      before: "Included",
      after: "Omitted",
      decision: "pending",
      targetIds: [item.id],
    });
  }
}

export function applyBulletRewrites(
  draft: TailoredResumeDraft,
  rewrites: Array<{ id: string; text: string }>,
  profile: ProfileSnapshot
): TailoredResumeDraft {
  const byId = new Map(rewrites.map((rewrite) => [rewrite.id, rewrite.text.trim()]));
  const companies = new Map(profile.experiences.map((experience) => [experience.id, experience.company]));
  const claims: string[] = [];

  const experiences = draft.experiences.map((experience) => ({
    ...experience,
    bullets: experience.bullets.map((bullet) => {
      const next = byId.get(bullet.id);
      if (!next || next === bullet.originalText.trim()) {
        return { ...bullet, suggestedText: bullet.originalText, unsupportedClaims: [] };
      }
      const evidence: BulletEvidence = {
        bullet: bullet.originalText,
        company: companies.get(experience.id) ?? experience.company,
        title: experience.title,
        startDate: experience.startDate,
        endDate: experience.endDate,
        otherCompanies: profile.experiences
          .filter((item) => item.id !== experience.id)
          .map((item) => item.company),
      };
      const review = reviewBulletRewrite(next, evidence);
      if (!review.grounded) {
        for (const claimText of review.unsupportedClaims) {
          claims.push(`${experience.company}: ${claimText}`);
        }
        return { ...bullet, suggestedText: bullet.originalText, unsupportedClaims: review.unsupportedClaims };
      }
      return { ...bullet, suggestedText: review.text, unsupportedClaims: [] };
    }),
  }));

  const kept = draft.changes.filter((change) => change.kind !== "rewrite_bullet");
  const rewriteChanges: ResumeChange[] = [];
  for (const experience of experiences) {
    for (const bullet of experience.bullets) {
      if (bullet.suggestedText.trim() === bullet.originalText.trim()) continue;
      rewriteChanges.push({
        id: `rewrite-bullet:${bullet.id}`,
        kind: "rewrite_bullet",
        label: `Rewrite bullet at ${experience.company}`,
        before: clipText(bullet.originalText),
        after: clipText(bullet.suggestedText),
        decision: "pending",
        targetIds: [bullet.id],
      });
    }
  }

  return {
    ...draft,
    experiences,
    changes: [...kept, ...rewriteChanges],
    unsupportedClaims: [...draft.unsupportedClaims, ...claims],
  };
}
