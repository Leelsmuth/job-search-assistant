"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withUserDb } from "@/db/user-context";
import { applications, companies, jobRequirements, resumeVersions } from "@/db/schema";
import { getOpenAiModel, isOpenAiConfigured } from "@/lib/env";
import { logAiRun } from "@/lib/performance/log-ai-run";
import { getUser } from "@/lib/supabase/server";
import { hashInput } from "@/lib/utils";
import { renderResumePlainText } from "@/modules/documents/render-resume";
import { resolveTailoredResume } from "@/modules/documents/resolve-resume";
import { selectTailoredResume } from "@/modules/documents/select-resume";
import { applyAcceptedResumeSuggestions } from "@/modules/resume-score/apply-suggestions";
import { hashJobPosting, hashResumeText } from "@/modules/resume-score/hash";
import {
  loadMatchProfile,
  loadResumeMatch,
  loadSuggestionContext,
  tailoringJob,
  type SuggestionContext,
} from "@/modules/resume-score/load";
import { scoreResumeMatch } from "@/modules/resume-score/score";
import { requestResumeSuggestions } from "@/modules/resume-score/suggest";
import { readResumeScores, saveResumeScore } from "@/modules/resume-score/store";
import {
  RESUME_SUGGESTION_PROMPT,
  type ResumeMatchView,
  type ResumeScoreDocument,
  type ResumeScoreSource,
  type ResumeSuggestion,
} from "@/modules/resume-score/types";
import { finalizeResumeSuggestions, recheckStoredSuggestions } from "@/modules/resume-score/verify-suggestions";
import { getApplicationForJob, requireOwnedJob } from "@/server/actions/helpers";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

function scoringDocument(text: string, fileType: string | null, exportedByApp: boolean): ResumeScoreDocument {
  return { text, fileType: exportedByApp ? "pdf" : fileType, exportedByApp };
}

function resumeForSource(
  context: SuggestionContext,
  source?: ResumeScoreSource
): { text: string; source: ResumeScoreSource; fileType: string | null } {
  const tailored = context.tailoredText.trim();
  const parsed = context.resume;
  if (source === "tailored" && tailored.length >= 40) {
    return { text: tailored, source: "tailored", fileType: "pdf" };
  }
  if (parsed && source !== "tailored") {
    return { text: parsed.text, source: "parsed", fileType: parsed.fileType };
  }
  if (tailored.length >= 40) return { text: tailored, source: "tailored", fileType: "pdf" };
  return { text: parsed?.text ?? "", source: "parsed", fileType: parsed?.fileType ?? null };
}

export async function getResumeMatch(jobId: string, source?: ResumeScoreSource): Promise<ResumeMatchView | null> {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const job = await requireOwnedJob(db, user.id, jobId);
    const company = job.companyId
      ? await db.query.companies.findFirst({
          where: eq(companies.id, job.companyId),
          columns: { name: true },
        })
      : null;
    const requirements = await db.query.jobRequirements.findMany({
      where: eq(jobRequirements.jobId, job.id),
    });
    const profile = await loadMatchProfile(db, user.id);
    return loadResumeMatch(
      db,
      user.id,
      {
        id: job.id,
        title: job.title,
        companyName: company?.name ?? null,
        description: job.description,
        technologies: job.technologies,
        requiredQualifications: job.requiredQualifications,
        preferredQualifications: job.preferredQualifications,
        requirements: requirements.map((requirement) => ({
          text: requirement.text,
          normalizedSkill: requirement.normalizedSkill,
          importance: requirement.importance,
        })),
      },
      profile,
      source
    );
  });
}

export async function generateResumeMatchSuggestions(jobId: string, source?: ResumeScoreSource): Promise<{
  suggestions: ResumeSuggestion[];
  cached: boolean;
  costEstimate: number | null;
  model: string | null;
  notice: string | null;
}> {
  const user = await requireUser();
  const prepared = await withUserDb(user.id, async (db) => {
    const context = await loadSuggestionContext(db, user.id, jobId);
    const resume = resumeForSource(context, source);
    if (resume.text.trim().length < 40) throw new Error("Upload a resume before requesting suggestions.");
    const score = scoreResumeMatch(context.job, scoringDocument(resume.text, resume.fileType, resume.source === "tailored"), {
      skills: context.profile.skills.map((skill) => skill.name),
      yearsExperience: context.profile.yearsExperience,
      titles: context.profile.experiences.map((experience) => experience.title),
      evidence: context.evidence,
    });
    const resumeHash = hashResumeText(resume.text);
    const jobHash = hashJobPosting(context.job);
    const stored = await readResumeScores(db, user.id, jobId);
    const cachedRow = stored?.find((row) => row.resumeHash === resumeHash && row.jobHash === jobHash) ?? null;
    return { context, score, resume, resumeHash, jobHash, schemaReady: stored != null, cached: cachedRow?.suggestions ?? null };
  });

  if (!prepared.schemaReady) {
    throw new Error("Apply migration 0022_resume_job_scores.sql before requesting AI suggestions. The migration is not applied by this change.");
  }
  if (prepared.cached) {
    const suggestions = recheckStoredSuggestions(prepared.cached, {
      evidence: prepared.context.evidence,
      profileSkills: prepared.context.profile.skills.map((skill) => skill.name),
    });
    return {
      suggestions,
      cached: true,
      costEstimate: null,
      model: getOpenAiModel(),
      notice: "Loaded saved suggestions for this resume and posting. No new model call.",
    };
  }

  const keywords = prepared.score.add
    .filter((item) => item.kind === "skill" && item.evidence)
    .map((item) => ({
      term: item.term,
      evidenceId: item.evidence?.id ?? null,
      evidenceText: (item.evidence?.text ?? "").slice(0, 400),
    }));
  const started = Date.now();
  const result = await requestResumeSuggestions({
    jobTitle: prepared.context.job.title,
    companyName: prepared.context.job.companyName,
    keywords,
    bullets: prepared.context.bullets,
    evidence: prepared.context.evidence,
    profileSkills: prepared.context.profile.skills.map((skill) => skill.name),
  });

  if (result.fallbackReason !== "no_supported_keywords" && result.fallbackReason !== "OPENAI_API_KEY missing") {
    await withUserDb(user.id, async (db) => {
      await logAiRun(db, {
        userId: user.id,
        taskType: "resume.ats_suggestions",
        promptVersion: RESUME_SUGGESTION_PROMPT,
        model: result.model,
        inputHash: hashInput(`${RESUME_SUGGESTION_PROMPT}:${prepared.resumeHash}:${prepared.jobHash}`),
        inputSummary: `${prepared.context.job.title} at ${prepared.context.job.companyName ?? "unknown company"}`,
        output: {
          suggestionCount: result.suggestions.length,
          keywords: result.suggestions.flatMap((suggestion) => suggestion.keywords),
          fallbackReason: result.fallbackReason,
          durationMs: Date.now() - started,
        },
        status: result.error ? "failed" : "completed",
        error: result.error,
        tokenInputCount: result.tokenInputCount ?? undefined,
        tokenOutputCount: result.tokenOutputCount ?? undefined,
        costEstimate: result.costEstimate,
        durationMs: Date.now() - started,
      });
      await saveResumeScore(db, {
        userId: user.id,
        jobId: jobId,
        source: prepared.resume.source,
        resumeHash: prepared.resumeHash,
        jobHash: prepared.jobHash,
        resumeDocumentId: prepared.resume.source === "parsed" ? prepared.context.resume?.id ?? null : null,
        score: prepared.score,
        suggestions: result.suggestions,
        replaceSuggestions: true,
      });
    });
  }

  const notice = result.fallbackReason === "OPENAI_API_KEY missing"
    ? "OPENAI_API_KEY is not set, so suggestions were not requested."
    : result.fallbackReason === "no_supported_keywords"
      ? "There are no missing keywords your profile can support, so no model call was made."
      : result.error
        ? "Suggestions were unavailable. Nothing was added to the resume."
        : result.suggestions.length === 0
          ? "The model returned no rewrites that stayed inside your evidence."
          : `Suggestions checked against your profile. Estimated cost $${(result.costEstimate ?? 0).toFixed(4)} is stored on the AI run.`;

  return {
    suggestions: result.suggestions,
    cached: false,
    costEstimate: result.costEstimate,
    model: result.model,
    notice,
  };
}

export async function applyResumeMatchSuggestions(
  jobId: string,
  accepted: Array<{ bulletId: string; suggestedText: string; keywords: string[] }>
): Promise<ResumeMatchView> {
  const user = await requireUser();
  const view = await withUserDb(user.id, async (db) => {
    const context = await loadSuggestionContext(db, user.id, jobId);
    const verified = finalizeResumeSuggestions(
      accepted.map((item) => ({
        bulletId: item.bulletId,
        originalText: "",
        suggestedText: item.suggestedText,
        keywords: item.keywords,
        evidenceIds: [],
      })),
      {
        bullets: context.bullets.map((bullet) => ({ id: bullet.id, text: bullet.text })),
        evidence: context.evidence,
        profileSkills: context.profile.skills.map((skill) => skill.name),
      }
    );
    if (verified.length === 0) {
      throw new Error("Those suggestions include skills your profile does not support.");
    }

    const baseDraft = selectTailoredResume(context.profile, tailoringJob(context));
    const draft = applyAcceptedResumeSuggestions(baseDraft, verified);
    const resolved = resolveTailoredResume(draft, context.profile.yearsExperience);
    const afterText = renderResumePlainText(resolved);
    const beforeText = renderResumePlainText(
      resolveTailoredResume(baseDraft, context.profile.yearsExperience)
    );
    const profileInput = {
      skills: context.profile.skills.map((skill) => skill.name),
      yearsExperience: context.profile.yearsExperience,
      titles: context.profile.experiences.map((experience) => experience.title),
      evidence: context.evidence,
    };
    const beforeScore = beforeText.trim()
      ? scoreResumeMatch(context.job, scoringDocument(beforeText, "pdf", true), profileInput).overall
      : null;
    const afterScore = scoreResumeMatch(context.job, scoringDocument(afterText, "pdf", true), profileInput);
    const jobHash = hashJobPosting(context.job);
    const [row] = await db
      .insert(resumeVersions)
      .values({
        userId: user.id,
        jobId,
        name: `${context.job.title} — ${context.job.companyName ?? "tailored"}`.slice(0, 180),
        versionType: "tailored",
        contentText: afterText,
        contentJson: { draft, resolved },
        generationMode: "llm",
        unsupportedClaims: [],
      })
      .returning();

    const application = await getApplicationForJob(db, user.id, jobId);
    if (application) {
      await db
        .update(applications)
        .set({ resumeVersionId: row.id, updatedAt: new Date() })
        .where(and(eq(applications.id, application.id), eq(applications.userId, user.id)));
    }

    const schemaReady = await saveResumeScore(db, {
      userId: user.id,
      jobId,
      source: "tailored",
      resumeVersionId: row.id,
      resumeHash: hashResumeText(afterText),
      jobHash,
      score: afterScore,
      suggestions: verified,
      beforeScore,
      afterScore: afterScore.overall,
      replaceSuggestions: true,
    });

    const match: ResumeMatchView = {
      source: "tailored",
      sourceLabel: "Tailored resume",
      resumeHash: hashResumeText(afterText),
      jobHash,
      hasParsed: Boolean(context.resume),
      hasTailored: true,
      schemaReady,
      aiAvailable: isOpenAiConfigured(),
      model: getOpenAiModel(),
      score: afterScore,
      beforeScore,
      afterScore: afterScore.overall,
      suggestions: verified,
      suggestionsCached: false,
    };
    return match;
  });

  revalidatePath(`/jobs/${jobId}`);
  return view;
}
