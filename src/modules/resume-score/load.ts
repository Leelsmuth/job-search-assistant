import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  candidateCertifications,
  candidateEducation,
  candidateExperienceBullets,
  candidateExperiences,
  candidateProfiles,
  candidateProjects,
  candidateSkills,
  companies,
  jobRequirements,
  jobs,
  profileEvidence,
  resumeDocuments,
  resumeVersions,
} from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { getOpenAiModel, isOpenAiConfigured } from "@/lib/env";
import type { JobTailoringContext, ProfileSnapshot } from "@/modules/documents/types";
import { hashJobPosting, hashResumeText } from "@/modules/resume-score/hash";
import { scoreResumeMatch } from "@/modules/resume-score/score";
import { recheckStoredSuggestions } from "@/modules/resume-score/verify-suggestions";
import { readResumeScores, saveResumeScore } from "@/modules/resume-score/store";
import type {
  ResumeMatchView,
  ResumeScoreDocument,
  ResumeScoreEvidence,
  ResumeScoreJob,
  ResumeScoreSource,
} from "@/modules/resume-score/types";

export type DefaultResumeText = {
  id: string;
  text: string;
  fileType: string | null;
};

export type ResumeMatchJob = ResumeScoreJob & {
  id: string;
  companyName: string | null;
};

export type ResumeMatchProfile = {
  id: string;
  yearsExperience: number | null;
  skills: string[];
  titles: string[];
};

const MIN_RESUME_CHARS = 40;

export async function loadMatchProfile(db: Db, userId: string): Promise<ResumeMatchProfile | null> {
  const profile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    columns: { id: true, yearsExperience: true },
  });
  if (!profile) return null;
  const skills = await db.query.candidateSkills.findMany({
    where: eq(candidateSkills.profileId, profile.id),
    columns: { name: true },
  });
  return {
    id: profile.id,
    yearsExperience: profile.yearsExperience,
    skills: skills.map((skill) => skill.name),
    titles: [],
  };
}

export async function loadDefaultResumeText(db: Db, userId: string): Promise<DefaultResumeText | null> {
  const document = await db.query.resumeDocuments.findFirst({
    where: eq(resumeDocuments.userId, userId),
    orderBy: [desc(resumeDocuments.createdAt)],
    columns: { id: true, extractedText: true, fileType: true },
  });
  const text = document?.extractedText?.trim() ?? "";
  if (!document || text.length < MIN_RESUME_CHARS) return null;
  return { id: document.id, text, fileType: document.fileType };
}

function asDocument(text: string, fileType: string | null, exportedByApp: boolean): ResumeScoreDocument {
  return {
    text,
    fileType: exportedByApp ? "pdf" : fileType,
    exportedByApp,
  };
}

function sourceLabel(source: ResumeScoreSource): string {
  return source === "tailored" ? "Tailored resume" : "Parsed resume";
}

export async function loadResumeMatch(
  db: Db,
  userId: string,
  job: ResumeMatchJob,
  profile: ResumeMatchProfile | null,
  preferredSource?: ResumeScoreSource
): Promise<ResumeMatchView | null> {
  const resume = await loadDefaultResumeText(db, userId);
  const evidence = profile
    ? await db.query.profileEvidence.findMany({
        where: eq(profileEvidence.profileId, profile.id),
        columns: { id: true, sourceType: true, evidenceText: true, normalizedSkills: true },
      })
    : [];
  const tailored = await db.query.resumeVersions.findFirst({
    where: and(eq(resumeVersions.userId, userId), eq(resumeVersions.jobId, job.id)),
    orderBy: [desc(resumeVersions.updatedAt)],
    columns: { id: true, contentText: true },
  });
  const tailoredText = tailored?.contentText?.trim() ?? "";
  const hasParsed = Boolean(resume);
  const hasTailored = tailoredText.length >= MIN_RESUME_CHARS;
  if (!hasParsed && !hasTailored) return null;

  const source: ResumeScoreSource =
    preferredSource === "tailored" && hasTailored
      ? "tailored"
      : preferredSource === "parsed" && hasParsed
        ? "parsed"
        : hasParsed
          ? "parsed"
          : "tailored";
  const activeText = source === "tailored" ? tailoredText : resume!.text;
  const document = asDocument(
    activeText,
    source === "tailored" ? "pdf" : resume?.fileType ?? null,
    source === "tailored"
  );
  const experienceRows = profile
    ? await db.query.candidateExperiences.findMany({
        where: eq(candidateExperiences.profileId, profile.id),
        columns: { title: true },
      })
    : [];
  const titles = [
    ...new Set(
      [...(profile?.titles ?? []), ...experienceRows.map((row) => row.title)]
        .map((title) => title.trim())
        .filter((title) => title.length > 0)
    ),
  ];
  const score = scoreResumeMatch(job, document, {
    skills: profile?.skills ?? [],
    yearsExperience: profile?.yearsExperience ?? null,
    titles,
    evidence: evidence.map((row) => ({
      id: row.id,
      sourceType: row.sourceType,
      text: row.evidenceText,
      normalizedSkills: row.normalizedSkills,
    })),
  });
  const resumeHash = hashResumeText(activeText);
  const jobHash = hashJobPosting(job);
  const stored = await readResumeScores(db, userId, job.id);
  const schemaReady = stored != null;
  if (schemaReady) {
    await saveResumeScore(db, {
      userId,
      jobId: job.id,
      resumeDocumentId: source === "parsed" ? resume?.id ?? null : null,
      resumeVersionId: source === "tailored" ? tailored?.id ?? null : null,
      source,
      resumeHash,
      jobHash,
      score,
      replaceSuggestions: false,
    });
  }
  const matching = stored?.find((row) => row.resumeHash === resumeHash && row.jobHash === jobHash) ?? null;
  const compared = stored?.find((row) => row.afterScore != null) ?? null;
  const suggestions = recheckStoredSuggestions(matching?.suggestions ?? [], {
    evidence: evidence.map((row) => ({
      id: row.id,
      sourceType: row.sourceType,
      text: row.evidenceText,
      normalizedSkills: row.normalizedSkills,
    })),
    profileSkills: profile?.skills ?? [],
  });
  return {
    source,
    sourceLabel: sourceLabel(source),
    resumeHash,
    jobHash,
    hasParsed,
    hasTailored,
    schemaReady,
    aiAvailable: isOpenAiConfigured(),
    model: getOpenAiModel(),
    score,
    beforeScore: compared?.beforeScore ?? null,
    afterScore: compared?.afterScore ?? null,
    suggestions,
    suggestionsCached: suggestions.length > 0,
  };
}

export type SuggestionContext = {
  job: ResumeMatchJob;
  profileId: string;
  profile: ProfileSnapshot;
  evidence: ResumeScoreEvidence[];
  bullets: Array<{ id: string; text: string; company: string; title: string }>;
  resume: DefaultResumeText | null;
  tailoredText: string;
  tailoredVersionId: string | null;
};

export async function loadSuggestionContext(
  db: Db,
  userId: string,
  jobId: string
): Promise<SuggestionContext> {
  const owned = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)),
  });
  if (!owned) throw new Error("Job not found");
  const company = owned.companyId
    ? await db.query.companies.findFirst({
        where: eq(companies.id, owned.companyId),
        columns: { name: true },
      })
    : null;
  const requirements = await db.query.jobRequirements.findMany({
    where: eq(jobRequirements.jobId, owned.id),
  });
  const profile = await loadProfileSnapshot(db, userId);
  if (!profile) throw new Error("Add a profile before scoring a resume.");
  const resume = await loadDefaultResumeText(db, userId);
  const tailored = await db.query.resumeVersions.findFirst({
    where: and(eq(resumeVersions.userId, userId), eq(resumeVersions.jobId, jobId)),
    orderBy: [desc(resumeVersions.updatedAt)],
    columns: { id: true, contentText: true },
  });
  return {
    job: {
      id: owned.id,
      title: owned.title,
      companyName: company?.name ?? null,
      description: owned.description,
      technologies: owned.technologies,
      requiredQualifications: owned.requiredQualifications,
      preferredQualifications: owned.preferredQualifications,
      requirements: requirements.map((requirement) => ({
        text: requirement.text,
        normalizedSkill: requirement.normalizedSkill,
        importance: requirement.importance,
      })),
    },
    profileId: profile.id,
    profile: profile.snapshot,
    evidence: profile.evidence,
    bullets: profile.bullets,
    resume,
    tailoredText: tailored?.contentText?.trim() ?? "",
    tailoredVersionId: tailored?.id ?? null,
  };
}

export function tailoringJob(context: SuggestionContext): JobTailoringContext {
  return {
    title: context.job.title,
    companyName: context.job.companyName,
    description: context.job.description ?? "",
    technologies: context.job.technologies ?? [],
    responsibilities: [],
    requiredQualifications: context.job.requiredQualifications ?? [],
    preferredQualifications: context.job.preferredQualifications ?? [],
    frontendFitScore: null,
    frontendFitReasons: [],
    requirements: (context.job.requirements ?? []).map((requirement) => ({
      text: requirement.text ?? "",
      normalizedSkill: requirement.normalizedSkill ?? null,
      importance: requirement.importance ?? null,
    })),
    requirementMatches: [],
  };
}

async function loadProfileSnapshot(
  db: Db,
  userId: string
): Promise<{
  id: string;
  snapshot: ProfileSnapshot;
  evidence: ResumeScoreEvidence[];
  bullets: SuggestionContext["bullets"];
} | null> {
  const profile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
  });
  if (!profile) return null;
  const skills = await db.query.candidateSkills.findMany({
    where: eq(candidateSkills.profileId, profile.id),
    orderBy: [asc(candidateSkills.createdAt)],
  });
  const experiences = await db.query.candidateExperiences.findMany({
    where: eq(candidateExperiences.profileId, profile.id),
    orderBy: [asc(candidateExperiences.createdAt)],
  });
  const experienceIds = experiences.map((experience) => experience.id);
  const bulletRows =
    experienceIds.length === 0
      ? []
      : await db.query.candidateExperienceBullets.findMany({
          where: inArray(candidateExperienceBullets.experienceId, experienceIds),
          orderBy: [asc(candidateExperienceBullets.createdAt)],
        });
  const projects = await db.query.candidateProjects.findMany({
    where: eq(candidateProjects.profileId, profile.id),
    orderBy: [asc(candidateProjects.createdAt)],
  });
  const education = await db.query.candidateEducation.findMany({
    where: eq(candidateEducation.profileId, profile.id),
    orderBy: [asc(candidateEducation.createdAt)],
  });
  const certifications = await db.query.candidateCertifications.findMany({
    where: eq(candidateCertifications.profileId, profile.id),
    orderBy: [asc(candidateCertifications.createdAt)],
  });
  const evidenceRows = await db.query.profileEvidence.findMany({
    where: eq(profileEvidence.profileId, profile.id),
  });
  const bulletsByExperience = new Map<string, typeof bulletRows>();
  for (const bullet of bulletRows) {
    const list = bulletsByExperience.get(bullet.experienceId) ?? [];
    list.push(bullet);
    bulletsByExperience.set(bullet.experienceId, list);
  }
  const evidence: ResumeScoreEvidence[] = evidenceRows.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    text: row.evidenceText,
    normalizedSkills: row.normalizedSkills,
  }));
  const snapshot: ProfileSnapshot = {
    displayName: profile.displayName,
    location: profile.location,
    summary: profile.summary,
    yearsExperience: profile.yearsExperience,
    targetTitles: profile.targetTitles ?? [],
    skills: skills.map((skill) => ({ id: skill.id, name: skill.name })),
    experiences: experiences.map((experience) => ({
      id: experience.id,
      company: experience.company,
      title: experience.title,
      startDate: experience.startDate,
      endDate: experience.endDate,
      location: experience.location,
      description: experience.description,
      bullets: (bulletsByExperience.get(experience.id) ?? []).map((bullet) => ({
        id: bullet.id,
        text: bullet.text,
        skills: bullet.skills ?? [],
        impact: bullet.impact,
      })),
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      skills: project.skills ?? [],
      evidence: project.evidence,
    })),
    education: education.map((item) => ({
      id: item.id,
      institution: item.institution,
      degree: item.degree,
      field: item.field,
      startDate: item.startDate,
      endDate: item.endDate,
    })),
    certifications: certifications.map((item) => ({
      id: item.id,
      name: item.name,
      issuer: item.issuer,
    })),
  };
  return {
    id: profile.id,
    snapshot,
    evidence,
    bullets: snapshot.experiences.flatMap((experience) =>
      experience.bullets.map((bullet) => ({
        id: bullet.id,
        text: bullet.text,
        company: experience.company,
        title: experience.title,
      }))
    ),
  };
}
