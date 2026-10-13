"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { withUserDb } from "@/db/user-context";
import {
  applications,
  candidateCertifications,
  candidateEducation,
  candidateExperiences,
  candidateProjects,
  candidateSkills,
  coverLetters,
  jobs,
  matchAnalyses,
  resumeVersions,
} from "@/db/schema";
import { getOpenAiModel, isOpenAiConfigured } from "@/lib/env";
import { logAiRun } from "@/lib/performance/log-ai-run";
import { getUser } from "@/lib/supabase/server";
import { hashInput } from "@/lib/utils";
import { bindTailoredDraft, parseTailoredResumeDraft } from "@/modules/documents/bind-draft";
import { finalizeCoverLetter } from "@/modules/documents/cover-letter";
import { renderBlocksDocx } from "@/modules/documents/docx";
import { profileCorpus, reviewCoverLetter } from "@/modules/documents/grounding";
import {
  COVER_LETTER_PROMPT,
  draftCoverLetterWithLlm,
  rewriteBulletsWithLlm,
  type LlmMeta,
} from "@/modules/documents/llm";
import { renderBlocksPdf } from "@/modules/documents/pdf";
import { letterBlocks, renderResumePlainText, resumeBlocks } from "@/modules/documents/render-resume";
import { resolveTailoredResume } from "@/modules/documents/resolve-resume";
import { applyBulletRewrites, selectTailoredResume } from "@/modules/documents/select-resume";
import { countWords } from "@/modules/documents/text";
import type {
  JobTailoringContext,
  ProfileSnapshot,
  ResolvedResume,
  StoredTailoredResume,
  TailoredResumeDraft,
} from "@/modules/documents/types";
import {
  getApplicationForJob,
  getOrCreateProfileDb,
  requireOwnedJob,
  type Db,
} from "@/server/actions/helpers";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export type ExportedFile = {
  filename: string;
  mimeType: string;
  base64: string;
  warnings: string[];
  draft?: TailoredResumeDraft;
};

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fileSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.slice(0, 40) || "document";
}

function readStoredResume(value: unknown): StoredTailoredResume | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { draft?: unknown; resolved?: ResolvedResume };
  try {
    const draft = parseTailoredResumeDraft(record.draft);
    if (!record.resolved || typeof record.resolved !== "object") return { draft, resolved: resolveTailoredResume(draft) };
    return { draft, resolved: record.resolved };
  } catch {
    return null;
  }
}

async function loadTailoringContext(db: Db, userId: string, jobId: string) {
  const profileRow = await getOrCreateProfileDb(db, userId);
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)),
    with: {
      company: true,
      requirements: true,
      matchAnalyses: {
        orderBy: [desc(matchAnalyses.createdAt)],
        limit: 1,
        with: {
          requirementMatches: {
            with: { requirement: true, evidence: true },
          },
        },
      },
    },
  });
  if (!job) throw new Error("Job not found");

  const [skills, experiences, projects, education, certifications] = await Promise.all([
    db.query.candidateSkills.findMany({
      where: eq(candidateSkills.profileId, profileRow.id),
      orderBy: [asc(candidateSkills.createdAt)],
    }),
    db.query.candidateExperiences.findMany({
      where: eq(candidateExperiences.profileId, profileRow.id),
      orderBy: [asc(candidateExperiences.createdAt)],
      with: { bullets: true },
    }),
    db.query.candidateProjects.findMany({
      where: eq(candidateProjects.profileId, profileRow.id),
      orderBy: [asc(candidateProjects.createdAt)],
    }),
    db.query.candidateEducation.findMany({
      where: eq(candidateEducation.profileId, profileRow.id),
      orderBy: [asc(candidateEducation.createdAt)],
    }),
    db.query.candidateCertifications.findMany({
      where: eq(candidateCertifications.profileId, profileRow.id),
      orderBy: [asc(candidateCertifications.createdAt)],
    }),
  ]);

  const profile: ProfileSnapshot = {
    displayName: profileRow.displayName,
    location: profileRow.location,
    summary: profileRow.summary,
    yearsExperience: profileRow.yearsExperience,
    targetTitles: profileRow.targetTitles ?? [],
    skills: skills.map((skill) => ({ id: skill.id, name: skill.name })),
    experiences: experiences.map((experience) => ({
      id: experience.id,
      company: experience.company,
      title: experience.title,
      startDate: experience.startDate,
      endDate: experience.endDate,
      location: experience.location,
      description: experience.description,
      bullets: [...experience.bullets]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((bullet) => ({
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

  const analysis = job.matchAnalyses[0];
  const jobContext: JobTailoringContext = {
    title: job.title,
    companyName: job.company?.name ?? null,
    description: job.description ?? "",
    technologies: job.technologies ?? [],
    responsibilities: job.responsibilities ?? [],
    requiredQualifications: job.requiredQualifications ?? [],
    preferredQualifications: job.preferredQualifications ?? [],
    frontendFitScore: job.frontendFitScore,
    frontendFitReasons: job.frontendFitReasons ?? [],
    requirements: job.requirements.map((requirement) => ({
      text: requirement.text,
      normalizedSkill: requirement.normalizedSkill,
      importance: requirement.importance,
    })),
    requirementMatches: (analysis?.requirementMatches ?? []).map((match) => ({
      requirementText: match.requirement?.text ?? "",
      normalizedSkill: match.requirement?.normalizedSkill ?? null,
      importance: match.requirement?.importance ?? null,
      matchStatus: match.matchStatus,
      confidence: match.confidence,
      evidenceText: match.evidence?.evidenceText ?? null,
    })),
  };

  return { profile, profileId: profileRow.id, job: jobContext };
}

function assertProfileHasContent(profile: ProfileSnapshot) {
  if (
    profile.summary?.trim() ||
    profile.experiences.length > 0 ||
    profile.skills.length > 0 ||
    profile.projects.length > 0
  ) {
    return;
  }
  throw new Error("Add experience, skills, or a summary on your profile before generating documents.");
}

function rewriteNotice(meta: LlmMeta | null, rewriteWithAi: boolean, claimCount: number): string | null {
  if (!rewriteWithAi) return "Bullets were selected and ordered. The wording is unchanged.";
  if (meta?.fallbackReason === "OPENAI_API_KEY missing") {
    return "OPENAI_API_KEY is not set, so bullets were ordered but not rewritten.";
  }
  if (meta?.error || meta?.fallbackReason) {
    return "Bullet rewriting was unavailable, so the original wording was kept.";
  }
  if (claimCount > 0) {
    return "Some rewrites were discarded because they added facts that are not in the original bullet.";
  }
  return `Bullets were rewritten with ${meta?.model ?? getOpenAiModel()} and checked against your profile.`;
}

async function logDocumentRun(
  db: Db,
  input: {
    userId: string;
    taskType: string;
    jobTitle: string;
    companyName: string | null;
    meta: LlmMeta;
    output: Record<string, unknown>;
    durationMs: number;
  }
) {
  await logAiRun(db, {
    userId: input.userId,
    taskType: input.taskType,
    promptVersion: input.meta.promptVersion,
    model: input.meta.model,
    inputHash: hashInput(`${input.taskType}:${input.jobTitle}:${input.companyName ?? ""}`),
    inputSummary: `${input.jobTitle} at ${input.companyName ?? "unknown company"}`,
    output: {
      ...input.output,
      fallbackReason: input.meta.fallbackReason,
    },
    status: input.meta.error ? "failed" : "completed",
    error: input.meta.error,
    tokenInputCount: input.meta.tokenInputCount ?? undefined,
    tokenOutputCount: input.meta.tokenOutputCount ?? undefined,
    costEstimate: input.meta.costEstimate,
    durationMs: input.durationMs,
  });
}

export async function getJobDocuments(jobId: string) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    await requireOwnedJob(db, user.id, jobId);
    const [versions, letters] = await Promise.all([
      db.query.resumeVersions.findMany({
        where: and(eq(resumeVersions.userId, user.id), eq(resumeVersions.jobId, jobId)),
        orderBy: [desc(resumeVersions.updatedAt)],
        limit: 8,
      }),
      db.query.coverLetters.findMany({
        where: and(eq(coverLetters.userId, user.id), eq(coverLetters.jobId, jobId)),
        orderBy: [desc(coverLetters.updatedAt)],
        limit: 1,
      }),
    ]);
    const latest = versions[0];
    const stored = latest ? readStoredResume(latest.contentJson) : null;
    const letter = letters[0];
    return {
      aiAvailable: isOpenAiConfigured(),
      model: getOpenAiModel(),
      versionId: stored ? latest.id : null,
      draft: stored?.draft ?? null,
      versions: versions.map((version) => ({
        id: version.id,
        name: version.name,
        versionType: version.versionType,
        generationMode: version.generationMode,
        createdAt: version.createdAt.toISOString(),
        updatedAt: version.updatedAt.toISOString(),
        unsupportedClaims: version.unsupportedClaims ?? [],
      })),
      coverLetter: letter
        ? {
            id: letter.id,
            body: letter.body,
            wordCount: letter.wordCount ?? countWords(letter.body),
            generationMode: letter.generationMode,
            unsupportedClaims: letter.unsupportedClaims ?? [],
            updatedAt: letter.updatedAt.toISOString(),
            model: letter.model,
          }
        : null,
    };
  });
}

export async function generateTailoredResume(jobId: string, rewriteWithAi = false) {
  const user = await requireUser();
  const loaded = await withUserDb(user.id, (db) => loadTailoringContext(db, user.id, jobId));
  assertProfileHasContent(loaded.profile);

  let draft = selectTailoredResume(loaded.profile, loaded.job);
  let meta: LlmMeta | null = null;
  const started = Date.now();
  if (rewriteWithAi) {
    const result = await rewriteBulletsWithLlm(draft, loaded.job);
    meta = result.meta;
    draft = applyBulletRewrites(draft, result.rewrites, loaded.profile);
    draft = {
      ...draft,
      generationMode: result.meta.model && !result.meta.fallbackReason ? "llm" : "deterministic",
      model: result.meta.model,
    };
  }
  const resolved = resolveTailoredResume(draft, loaded.profile.yearsExperience);

  const saved = await withUserDb(user.id, async (db) => {
    await requireOwnedJob(db, user.id, jobId);
    const [row] = await db
      .insert(resumeVersions)
      .values({
        userId: user.id,
        name: `${loaded.job.title} — ${loaded.job.companyName ?? "tailored"}`.slice(0, 180),
        versionType: "tailored_draft",
        contentText: renderResumePlainText(resolved),
        contentJson: { draft, resolved },
        jobId,
        generationMode: draft.generationMode,
        unsupportedClaims: draft.unsupportedClaims,
      })
      .returning();
    if (rewriteWithAi && meta) {
      await logDocumentRun(db, {
        userId: user.id,
        taskType: "resume.tailor_document",
        jobTitle: loaded.job.title,
        companyName: loaded.job.companyName,
        meta,
        durationMs: Date.now() - started,
        output: {
          generationMode: draft.generationMode,
          unsupportedClaimCount: draft.unsupportedClaims.length,
          resumeVersionId: row.id,
        },
      });
    }
    return row;
  });

  revalidatePath(`/jobs/${jobId}`);
  return {
    versionId: saved.id,
    draft,
    aiAvailable: isOpenAiConfigured(),
    model: getOpenAiModel(),
    notice: rewriteNotice(meta, rewriteWithAi, draft.unsupportedClaims.length),
  };
}

export async function saveTailoredResume(jobId: string, versionId: string | null, draftInput: unknown) {
  const user = await requireUser();
  const parsed = parseTailoredResumeDraft(draftInput);
  const result = await withUserDb(user.id, async (db) => {
    const loaded = await loadTailoringContext(db, user.id, jobId);
    const bound = bindTailoredDraft(parsed, loaded.profile, {
      title: loaded.job.title,
      companyName: loaded.job.companyName,
    });
    const values = {
      name: `${loaded.job.title} — ${loaded.job.companyName ?? "tailored"}`.slice(0, 180),
      versionType: "tailored",
      contentText: renderResumePlainText(bound.resolved),
      contentJson: { draft: bound.draft, resolved: bound.resolved },
      jobId,
      generationMode: bound.draft.generationMode,
      unsupportedClaims: bound.warnings,
      updatedAt: new Date(),
    };

    let id = versionId;
    if (versionId) {
      const existing = await db.query.resumeVersions.findFirst({
        where: and(eq(resumeVersions.id, versionId), eq(resumeVersions.userId, user.id)),
      });
      if (!existing || (existing.jobId && existing.jobId !== jobId)) {
        throw new Error("Resume version not found");
      }
      await db.update(resumeVersions).set(values).where(eq(resumeVersions.id, versionId));
    } else {
      const [row] = await db.insert(resumeVersions).values({ ...values, userId: user.id }).returning();
      id = row.id;
    }

    const application = await getApplicationForJob(db, user.id, jobId);
    if (application && id) {
      await db
        .update(applications)
        .set({ resumeVersionId: id, updatedAt: new Date() })
        .where(and(eq(applications.id, application.id), eq(applications.userId, user.id)));
    }
    return { versionId: id ?? "", draft: bound.draft, warnings: bound.warnings };
  });
  revalidatePath(`/jobs/${jobId}`);
  return result;
}

async function renderResumeFile(
  resolved: ResolvedResume,
  companyName: string | null,
  format: "pdf" | "docx"
): Promise<ExportedFile> {
  const blocks = resumeBlocks(resolved);
  const title = `${resolved.header.name} resume`;
  const bytes = format === "pdf" ? await renderBlocksPdf(blocks, title) : await renderBlocksDocx(blocks, title);
  const ext = format === "pdf" ? "pdf" : "docx";
  return {
    filename: `${fileSlug(resolved.header.name)}-${fileSlug(companyName ?? "job")}-resume.${ext}`,
    mimeType:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64: toBase64(bytes),
    warnings: [],
  };
}

export async function exportResumeDraft(jobId: string, draftInput: unknown, format: "pdf" | "docx") {
  const user = await requireUser();
  const parsed = parseTailoredResumeDraft(draftInput);
  const loaded = await withUserDb(user.id, (db) => loadTailoringContext(db, user.id, jobId));
  const bound = bindTailoredDraft(parsed, loaded.profile, {
    title: loaded.job.title,
    companyName: loaded.job.companyName,
  });
  const file = await renderResumeFile(bound.resolved, loaded.job.companyName, format);
  return { ...file, warnings: bound.warnings, draft: bound.draft };
}

export async function exportSavedResume(jobId: string, versionId: string, format: "pdf" | "docx") {
  const user = await requireUser();
  const stored = await withUserDb(user.id, async (db) => {
    await requireOwnedJob(db, user.id, jobId);
    const version = await db.query.resumeVersions.findFirst({
      where: and(
        eq(resumeVersions.id, versionId),
        eq(resumeVersions.userId, user.id),
        eq(resumeVersions.jobId, jobId)
      ),
    });
    if (!version) throw new Error("Resume version not found");
    const parsed = readStoredResume(version.contentJson);
    if (!parsed) throw new Error("This resume version has no tailored content.");
    return { resolved: parsed.resolved, companyName: parsed.draft.companyName };
  });
  return renderResumeFile(stored.resolved, stored.companyName, format);
}

export async function generateCoverLetter(jobId: string) {
  const user = await requireUser();
  const loaded = await withUserDb(user.id, (db) => loadTailoringContext(db, user.id, jobId));
  assertProfileHasContent(loaded.profile);
  const started = Date.now();
  const llm = await draftCoverLetterWithLlm(loaded.profile, loaded.job);
  const highlighted = resolveTailoredResume(
    selectTailoredResume(loaded.profile, loaded.job),
    loaded.profile.yearsExperience
  );
  const finalized = finalizeCoverLetter(llm.letter, {
    profile: loaded.profile,
    jobTitle: loaded.job.title,
    companyName: loaded.job.companyName,
    highlighted,
  });

  const saved = await withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);
    await requireOwnedJob(db, user.id, jobId);
    const [letter] = await db
      .insert(coverLetters)
      .values({
        userId: user.id,
        jobId,
        profileId: profile.id,
        body: finalized.body,
        generationMode: finalized.generationMode,
        unsupportedClaims: finalized.unsupportedClaims,
        model: llm.meta.model,
        wordCount: finalized.wordCount,
      })
      .returning();
    await logDocumentRun(db, {
      userId: user.id,
      taskType: "cover_letter.generate",
      jobTitle: loaded.job.title,
      companyName: loaded.job.companyName,
      meta: llm.meta.model || llm.meta.fallbackReason ? llm.meta : { ...llm.meta, promptVersion: COVER_LETTER_PROMPT },
      durationMs: Date.now() - started,
      output: {
        generationMode: finalized.generationMode,
        wordCount: finalized.wordCount,
        unsupportedClaimCount: finalized.unsupportedClaims.length,
        coverLetterId: letter.id,
      },
    });
    return letter;
  });

  revalidatePath(`/jobs/${jobId}`);
  const notice =
    llm.meta.fallbackReason === "OPENAI_API_KEY missing"
      ? "OPENAI_API_KEY is not set, so this is a template draft grounded in your profile."
      : finalized.generationMode === "template"
        ? "The model draft was not fully grounded, so a template draft was saved instead."
        : `Cover letter drafted with ${llm.meta.model ?? getOpenAiModel()}.`;

  return {
    coverLetter: {
      id: saved.id,
      body: saved.body,
      wordCount: saved.wordCount ?? finalized.wordCount,
      generationMode: saved.generationMode,
      unsupportedClaims: saved.unsupportedClaims ?? [],
      updatedAt: saved.updatedAt.toISOString(),
      model: saved.model,
    },
    notice,
    aiAvailable: isOpenAiConfigured(),
    model: getOpenAiModel(),
  };
}

function reviewLetterOrThrow(body: string, profile: ProfileSnapshot, job: JobTailoringContext) {
  const review = reviewCoverLetter(body, profileCorpus(profile), {
    organizations: [...profile.experiences.map((experience) => experience.company), job.companyName ?? ""].filter(
      Boolean
    ),
    jobTitle: job.title,
    titles: profile.experiences.map((experience) => experience.title),
  });
  if (!review.grounded) {
    throw new Error(
      `Cover letter includes claims that are not in your profile: ${review.unsupportedClaims.join("; ")}`
    );
  }
}

export async function saveCoverLetter(jobId: string, letterId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Cover letter is empty.");
  if (trimmed.length > 20000) throw new Error("Cover letter is too long.");
  const user = await requireUser();
  const result = await withUserDb(user.id, async (db) => {
    const loaded = await loadTailoringContext(db, user.id, jobId);
    reviewLetterOrThrow(trimmed, loaded.profile, loaded.job);
    const [updated] = await db
      .update(coverLetters)
      .set({
        body: trimmed,
        wordCount: countWords(trimmed),
        unsupportedClaims: [],
        updatedAt: new Date(),
      })
      .where(
        and(eq(coverLetters.id, letterId), eq(coverLetters.userId, user.id), eq(coverLetters.jobId, jobId))
      )
      .returning();
    if (!updated) throw new Error("Cover letter not found");
    return {
      id: updated.id,
      body: updated.body,
      wordCount: updated.wordCount ?? countWords(updated.body),
      generationMode: updated.generationMode,
      unsupportedClaims: updated.unsupportedClaims ?? [],
      updatedAt: updated.updatedAt.toISOString(),
      model: updated.model,
    };
  });
  revalidatePath(`/jobs/${jobId}`);
  return result;
}

export async function exportCoverLetter(jobId: string, body: string, format: "pdf" | "docx" | "txt") {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Cover letter is empty.");
  const user = await requireUser();
  const loaded = await withUserDb(user.id, (db) => loadTailoringContext(db, user.id, jobId));
  reviewLetterOrThrow(trimmed, loaded.profile, loaded.job);
  const slug = `${fileSlug(loaded.profile.displayName ?? "candidate")}-${fileSlug(loaded.job.companyName ?? "job")}-cover-letter`;
  if (format === "txt") {
    return {
      filename: `${slug}.txt`,
      mimeType: "text/plain",
      base64: Buffer.from(trimmed, "utf8").toString("base64"),
      warnings: [],
    } satisfies ExportedFile;
  }
  const blocks = letterBlocks(trimmed);
  const title = `${loaded.profile.displayName ?? "Candidate"} cover letter`;
  const bytes = format === "pdf" ? await renderBlocksPdf(blocks, title) : await renderBlocksDocx(blocks, title);
  return {
    filename: `${slug}.${format === "pdf" ? "pdf" : "docx"}`,
    mimeType:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64: toBase64(bytes),
    warnings: [],
  } satisfies ExportedFile;
}
