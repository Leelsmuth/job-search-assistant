"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { withUserDb } from "@/db/user-context";
import {
  applicationAnswers,
  applicationEvents,
  applicationProfiles,
  applications,
  candidateProfiles,
  coverLetters,
  jobApplicationForms,
  jobs,
  profileEvidence,
  resumeVersions,
} from "@/db/schema";
import { getOpenAiModel, isOpenAiConfigured } from "@/lib/env";
import { logAiRun } from "@/lib/performance/log-ai-run";
import { getUser } from "@/lib/supabase/server";
import { hashInput } from "@/lib/utils";
import { draftApplicationAnswer } from "@/modules/ai/client";
import { detectUnsupportedClaims } from "@/modules/ai/schemas";
import {
  fetchApplicationForm,
  isFormCacheFresh,
  resolveApplyTarget,
  safeApplyUrl,
} from "@/modules/apply/fetch-form";
import { mapFormQuestions } from "@/modules/apply/map-questions";
import {
  defaultApplicationProfile,
  emptyToNull,
  applicationProfileFromRow,
  parseApplicationProfile,
  profileIsReady,
  savedAnswersForStorage,
} from "@/modules/apply/profile";
import { readStoredQuestions } from "@/modules/apply/questions";
import {
  AssistedApplySchemaError,
  isAssistedApplySchemaError,
} from "@/modules/apply/schema-error";
import type {
  ApplicationProfile,
  ApplyProvider,
  ExistingAnswer,
  FetchedApplicationForm,
  FormQuestion,
  MappedQuestion,
  PreparedApplication,
} from "@/modules/apply/types";
import { resolveApplicationForJob, type Db } from "@/server/actions/helpers";

const MAX_DRAFTS = 12;

function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) parts.push(current.message);
    if (typeof current === "object") {
      const record = current as { code?: unknown; message?: unknown; cause?: unknown };
      if (typeof record.code === "string") parts.push(record.code);
      if (typeof record.message === "string") parts.push(record.message);
      current = record.cause;
    } else {
      break;
    }
  }
  return parts.join("\n");
}

function isMissingAssistedApplySchema(error: unknown): boolean {
  const text = collectErrorText(error);
  if (!/application_profiles|job_application_forms|application_events/.test(text)) return false;
  return /does not exist|42P01|42703/i.test(text);
}

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function userDb<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  try {
    return await withUserDb(userId, fn);
  } catch (error) {
    if (isMissingAssistedApplySchema(error)) throw new AssistedApplySchemaError();
    throw error;
  }
}

type CachedForm = {
  provider: ApplyProvider;
  questions: FormQuestion[];
  source: "api" | "standard";
  applyUrl: string | null;
  note: string | null;
  fetchedAt: string;
};

type LoadedContext = {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  target: ReturnType<typeof resolveApplyTarget>;
  profile: ApplicationProfile;
  profileSummary: string;
  evidence: Array<{ id: string; evidenceText: string }>;
  existingAnswers: ExistingAnswer[];
  form: CachedForm | null;
  resume: { id: string; name: string } | null;
  coverLetter: { id: string; body: string } | null;
  applicationStatus: string | null;
};

function asProvider(value: string): ApplyProvider {
  if (value === "greenhouse" || value === "lever" || value === "ashby" || value === "workday" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function profileFromRow(row: typeof applicationProfiles.$inferSelect | undefined): ApplicationProfile {
  return applicationProfileFromRow(row);
}

function readForm(row: typeof jobApplicationForms.$inferSelect): CachedForm | null {
  const questions = readStoredQuestions(row.questions);
  if (!questions) return null;
  return {
    provider: asProvider(row.provider),
    questions,
    source: row.source === "api" ? "api" : "standard",
    applyUrl: row.applyUrl,
    note: row.note,
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

async function loadPrepareContext(db: Db, userId: string, jobId: string): Promise<LoadedContext | null> {
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)),
    with: { company: true, source: true },
  });
  if (!job) return null;

  const profileRow = await db.query.applicationProfiles.findFirst({
    where: eq(applicationProfiles.userId, userId),
  });
  const candidate = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    columns: { id: true, summary: true },
  });
  const evidence = candidate
    ? await db.query.profileEvidence.findMany({
        where: eq(profileEvidence.profileId, candidate.id),
        columns: { id: true, evidenceText: true },
      })
    : [];
  const application = await db.query.applications.findFirst({
    where: and(eq(applications.userId, userId), eq(applications.jobId, jobId)),
  });
  const answers = application
    ? await db.query.applicationAnswers.findMany({
        where: eq(applicationAnswers.applicationId, application.id),
      })
    : [];
  const resume = await db.query.resumeVersions.findFirst({
    where: and(eq(resumeVersions.userId, userId), eq(resumeVersions.jobId, jobId)),
    orderBy: [desc(resumeVersions.updatedAt)],
    columns: { id: true, name: true },
  });
  const letter = await db.query.coverLetters.findFirst({
    where: and(eq(coverLetters.userId, userId), eq(coverLetters.jobId, jobId)),
    orderBy: [desc(coverLetters.updatedAt)],
    columns: { id: true, body: true },
  });
  const formRow = await db.query.jobApplicationForms.findFirst({
    where: and(eq(jobApplicationForms.userId, userId), eq(jobApplicationForms.jobId, jobId)),
  });

  return {
    jobTitle: job.title,
    companyName: job.company?.name ?? "Company",
    jobDescription: job.description ?? "",
    target: resolveApplyTarget({
      jobUrl: job.jobUrl,
      sourceUrl: job.source?.sourceUrl ?? job.discoveredBoardUrl,
      sourceProvider: job.source?.provider ?? null,
      sourceJobId: job.sourceJobId ?? job.source?.sourceJobId ?? null,
    }),
    profile: profileFromRow(profileRow),
    profileSummary: candidate?.summary ?? "",
    evidence,
    existingAnswers: answers.map((answer) => ({
      question: answer.question,
      draftAnswer: answer.draftAnswer,
      finalAnswer: answer.finalAnswer,
      evidenceIds: answer.evidenceIds ?? [],
      unsupportedClaims: answer.unsupportedClaims ?? [],
    })),
    form: formRow ? readForm(formRow) : null,
    resume: resume ? { id: resume.id, name: resume.name } : null,
    coverLetter: letter ? { id: letter.id, body: letter.body } : null,
    applicationStatus: application?.status ?? null,
  };
}

async function upsertForm(
  db: Db,
  userId: string,
  jobId: string,
  fetched: FetchedApplicationForm
): Promise<CachedForm> {
  const existing = await db.query.jobApplicationForms.findFirst({
    where: and(eq(jobApplicationForms.userId, userId), eq(jobApplicationForms.jobId, jobId)),
  });
  const now = new Date();
  const values = {
    provider: fetched.provider,
    questions: fetched.questions,
    source: fetched.source,
    applyUrl: fetched.applyUrl,
    note: fetched.note,
    fetchError: fetched.error,
    fetchedAt: now,
    updatedAt: now,
  };
  if (existing) {
    await db
      .update(jobApplicationForms)
      .set(values)
      .where(and(eq(jobApplicationForms.id, existing.id), eq(jobApplicationForms.userId, userId)));
  } else {
    await db.insert(jobApplicationForms).values({ userId, jobId, ...values });
  }
  return {
    provider: fetched.provider,
    questions: fetched.questions,
    source: fetched.source,
    applyUrl: fetched.applyUrl,
    note: fetched.note,
    fetchedAt: now.toISOString(),
  };
}

function toPacket(jobId: string, loaded: LoadedContext, form: CachedForm, answers: MappedQuestion[]): PreparedApplication {
  return {
    jobId,
    jobTitle: loaded.jobTitle,
    companyName: loaded.companyName,
    provider: form.provider,
    formSource: form.source,
    formNote: form.note,
    fetchedAt: form.fetchedAt,
    applyUrl: safeApplyUrl(form.applyUrl ?? loaded.target.jobUrl),
    profileReady: profileIsReady(loaded.profile),
    answers,
    resume: loaded.resume,
    coverLetter: loaded.coverLetter,
    applicationStatus: loaded.applicationStatus,
    alreadyApplied: loaded.applicationStatus === "applied",
  };
}

function mapLoaded(loaded: LoadedContext, form: CachedForm): MappedQuestion[] {
  return mapFormQuestions({
    questions: form.questions,
    profile: loaded.profile,
    coverLetterBody: loaded.coverLetter?.body ?? null,
    existingAnswers: loaded.existingAnswers,
  });
}

async function ensurePrepared(userId: string, jobId: string, refresh: boolean) {
  const loaded = await userDb(userId, (db) => loadPrepareContext(db, userId, jobId));
  if (!loaded) return null;
  const fresh = loaded.form ? isFormCacheFresh(loaded.form.fetchedAt) : false;
  if (!refresh && loaded.form && fresh) {
    return { loaded, form: loaded.form };
  }
  const fetched = await fetchApplicationForm(loaded.target);
  const form = await userDb(userId, (db) => upsertForm(db, userId, jobId, fetched));
  return { loaded, form };
}

export async function getApplicationProfile(): Promise<{ profile: ApplicationProfile; schemaReady: boolean }> {
  const user = await requireUser();
  try {
    const profile = await userDb(user.id, async (db) => {
      const row = await db.query.applicationProfiles.findFirst({
        where: eq(applicationProfiles.userId, user.id),
      });
      return profileFromRow(row);
    });
    return { profile, schemaReady: true };
  } catch (error) {
    if (isAssistedApplySchemaError(error)) {
      return { profile: defaultApplicationProfile(), schemaReady: false };
    }
    throw error;
  }
}

export async function saveApplicationProfile(input: unknown) {
  const profile = parseApplicationProfile(input);
  const user = await requireUser();
  const savedAnswers = savedAnswersForStorage(profile.savedAnswers);
  await userDb(user.id, async (db) => {
    const existing = await db.query.applicationProfiles.findFirst({
      where: eq(applicationProfiles.userId, user.id),
    });
    const values = {
      legalName: emptyToNull(profile.legalName),
      email: emptyToNull(profile.email),
      phone: emptyToNull(profile.phone),
      city: emptyToNull(profile.city),
      province: emptyToNull(profile.province),
      linkedinUrl: emptyToNull(profile.linkedinUrl),
      githubUrl: emptyToNull(profile.githubUrl),
      portfolioUrl: emptyToNull(profile.portfolioUrl),
      workAuthorization: profile.workAuthorization,
      requiresSponsorship: profile.requiresSponsorship,
      willingToRelocate: profile.willingToRelocate,
      earliestStartDate: emptyToNull(profile.earliestStartDate),
      salaryExpectationCad: profile.salaryExpectationCad,
      pronouns: emptyToNull(profile.pronouns),
      howDidYouHear: emptyToNull(profile.howDidYouHear),
      eeoGender: profile.eeoGender,
      eeoRace: profile.eeoRace,
      eeoVeteran: profile.eeoVeteran,
      eeoDisability: profile.eeoDisability,
      savedAnswers,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(applicationProfiles).set(values).where(eq(applicationProfiles.userId, user.id));
    } else {
      await db.insert(applicationProfiles).values({ userId: user.id, ...values });
    }
  });
  revalidatePath("/settings");
  revalidatePath("/jobs");
}

export async function getPreparedApplication(jobId: string, refresh = false): Promise<PreparedApplication | null> {
  const user = await requireUser();
  const prepared = await ensurePrepared(user.id, jobId, refresh);
  if (!prepared) return null;
  return toPacket(jobId, prepared.loaded, prepared.form, mapLoaded(prepared.loaded, prepared.form));
}

type WrittenDraft = {
  label: string;
  answer: string;
  evidenceIds: string[];
  unsupportedClaims: string[];
};

async function persistDrafts(db: Db, userId: string, jobId: string, drafts: WrittenDraft[]) {
  const app = await resolveApplicationForJob(db, userId, jobId);
  const current = await db.query.applicationAnswers.findMany({
    where: eq(applicationAnswers.applicationId, app.id),
  });
  const written: WrittenDraft[] = [];
  for (const draft of drafts) {
    const row = current.find((answer) => answer.question === draft.label);
    if (row?.finalAnswer != null || row?.draftAnswer) continue;
    if (row) {
      await db
        .update(applicationAnswers)
        .set({
          draftAnswer: draft.answer,
          evidenceIds: draft.evidenceIds,
          unsupportedClaims: draft.unsupportedClaims,
          updatedAt: new Date(),
        })
        .where(eq(applicationAnswers.id, row.id));
    } else {
      await db.insert(applicationAnswers).values({
        applicationId: app.id,
        question: draft.label,
        draftAnswer: draft.answer,
        evidenceIds: draft.evidenceIds,
        unsupportedClaims: draft.unsupportedClaims,
      });
    }
    written.push(draft);
  }
  if (written.length > 0) {
    await logAiRun(db, {
      userId,
      taskType: "application.draft_answer",
      promptVersion: "application.draft_answer.v2",
      model: isOpenAiConfigured() ? getOpenAiModel() : null,
      inputHash: hashInput(`assisted-apply:${jobId}:${written.map((item) => item.label).join("|")}`),
      inputSummary: written.map((item) => item.label).join("; ").slice(0, 240),
      output: {
        draftCount: written.length,
        unsupportedClaimCount: written.reduce((sum, item) => sum + item.unsupportedClaims.length, 0),
        fallbackReason: isOpenAiConfigured() ? null : "OPENAI_API_KEY missing",
      },
      status: "completed",
    });
  }
  return written;
}

function overlayDrafts(answers: MappedQuestion[], drafts: WrittenDraft[]): MappedQuestion[] {
  const byLabel = new Map(drafts.map((draft) => [draft.label, draft]));
  return answers.map((answer) => {
    const draft = byLabel.get(answer.label);
    if (!answer.needsDraft || !draft) return answer;
    return {
      ...answer,
      answer: draft.answer,
      valueSource: "draft",
      needsDraft: false,
      evidenceIds: draft.evidenceIds,
      unsupportedClaims: draft.unsupportedClaims,
    };
  });
}

export async function draftPreparedAnswers(jobId: string): Promise<PreparedApplication | null> {
  const user = await requireUser();
  const prepared = await ensurePrepared(user.id, jobId, false);
  if (!prepared) return null;
  const mapped = mapLoaded(prepared.loaded, prepared.form);
  const pending = mapped.filter((answer) => answer.needsDraft).slice(0, MAX_DRAFTS);
  const drafts: WrittenDraft[] = [];
  for (const answer of pending) {
    const result = await draftApplicationAnswer(
      answer.label,
      prepared.loaded.profileSummary,
      prepared.loaded.jobDescription,
      prepared.loaded.evidence
    );
    drafts.push({
      label: answer.label,
      answer: result.answer,
      evidenceIds: result.evidenceIds,
      unsupportedClaims: result.unsupportedClaims,
    });
  }
  const written =
    drafts.length === 0
      ? []
      : await userDb(user.id, (db) => persistDrafts(db, user.id, jobId, drafts));
  return toPacket(jobId, prepared.loaded, prepared.form, overlayDrafts(mapped, written));
}

function submittedAnswers(input: unknown): Array<{ questionId: string; answer: string }> {
  if (!Array.isArray(input)) throw new Error("Answers are missing");
  if (input.length > 80) throw new Error("Too many answers");
  return input.map((item) => {
    if (!item || typeof item !== "object") throw new Error("An answer is invalid");
    const record = item as { questionId?: unknown; answer?: unknown };
    if (typeof record.questionId !== "string" || typeof record.answer !== "string") {
      throw new Error("An answer is invalid");
    }
    if (record.answer.length > 8000) throw new Error("An answer is too long");
    return { questionId: record.questionId, answer: record.answer };
  });
}

async function writeFinalAnswers(
  db: Db,
  userId: string,
  jobId: string,
  loaded: LoadedContext,
  form: CachedForm,
  submitted: Array<{ questionId: string; answer: string }>
) {
  const app = await resolveApplicationForJob(db, userId, jobId);
  const current = await db.query.applicationAnswers.findMany({
    where: eq(applicationAnswers.applicationId, app.id),
  });
  const mapped = mapFormQuestions({
    questions: form.questions,
    profile: loaded.profile,
    coverLetterBody: loaded.coverLetter?.body ?? null,
    existingAnswers: [],
  });
  const byId = new Map(mapped.map((answer) => [answer.questionId, answer]));
  const evidenceTexts = loaded.evidence.map((item) => item.evidenceText);
  const saved: Array<{ question: string; answer: string; source: string; unsupportedClaims: string[] }> = [];

  for (const item of submitted) {
    const question = byId.get(item.questionId);
    if (!question) continue;
    const existing = current.find((answer) => answer.question === question.label);
    const text = item.answer;
    const unchangedDraft = existing?.draftAnswer != null && existing.draftAnswer === text;
    const unsupportedClaims =
      question.kind === "open_ended"
        ? unchangedDraft
          ? (existing?.unsupportedClaims ?? [])
          : detectUnsupportedClaims(text, evidenceTexts, loaded.jobDescription)
        : [];
    if (existing) {
      await db
        .update(applicationAnswers)
        .set({
          finalAnswer: text,
          unsupportedClaims,
          evidenceIds: unchangedDraft ? (existing.evidenceIds ?? []) : existing.evidenceIds,
          updatedAt: new Date(),
        })
        .where(eq(applicationAnswers.id, existing.id));
    } else {
      await db.insert(applicationAnswers).values({
        applicationId: app.id,
        question: question.label,
        draftAnswer: question.kind === "open_ended" ? text : question.answer || null,
        finalAnswer: text,
        unsupportedClaims,
      });
    }
    saved.push({
      question: question.label,
      answer: text,
      source: question.kind,
      unsupportedClaims,
    });
  }
  return { applicationId: app.id, saved };
}

export async function savePreparedAnswers(jobId: string, input: unknown): Promise<PreparedApplication | null> {
  const submitted = submittedAnswers(input);
  const user = await requireUser();
  const prepared = await ensurePrepared(user.id, jobId, false);
  if (!prepared) return null;
  await userDb(user.id, (db) =>
    writeFinalAnswers(db, user.id, jobId, prepared.loaded, prepared.form, submitted)
  );
  const reloaded = await userDb(user.id, (db) => loadPrepareContext(db, user.id, jobId));
  if (!reloaded?.form) return null;
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/apply`);
  return toPacket(jobId, reloaded, reloaded.form, mapLoaded(reloaded, reloaded.form));
}

export async function markPreparedApplicationApplied(jobId: string, input: unknown) {
  const submitted = submittedAnswers(input);
  const user = await requireUser();
  const prepared = await ensurePrepared(user.id, jobId, false);
  if (!prepared) throw new Error("Job not found");
  const result = await userDb(user.id, async (db) => {
    const written = await writeFinalAnswers(db, user.id, jobId, prepared.loaded, prepared.form, submitted);
    const app = await db.query.applications.findFirst({
      where: and(eq(applications.id, written.applicationId), eq(applications.userId, user.id)),
    });
    if (!app) throw new Error("Application not found");
    const alreadyApplied = app.status === "applied";
    await db
      .update(applications)
      .set({
        status: "applied",
        dateApplied: app.dateApplied ?? new Date(),
        resumeVersionId: prepared.loaded.resume?.id ?? app.resumeVersionId,
        updatedAt: new Date(),
      })
      .where(and(eq(applications.id, app.id), eq(applications.userId, user.id)));
    await db.insert(applicationEvents).values({
      applicationId: app.id,
      eventType: "marked_applied",
      eventDate: new Date(),
      notes: "Assisted apply snapshot. The application was not submitted by the app.",
      payload: {
        kind: "assisted_apply",
        provider: prepared.form.provider,
        applyUrl: safeApplyUrl(prepared.form.applyUrl ?? prepared.loaded.target.jobUrl),
        resumeVersionId: prepared.loaded.resume?.id ?? null,
        coverLetterId: prepared.loaded.coverLetter?.id ?? null,
        answers: written.saved,
      },
    });
    return { alreadyApplied };
  });

  revalidatePath("/applications");
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/apply`);
  return result;
}
