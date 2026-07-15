"use server";

import { revalidatePath } from "next/cache";
import { eq, desc, and, inArray } from "drizzle-orm";
import { withUserDb } from "@/db/user-context";
import {
  requireOwnedJob,
  getApplicationForJob,
  resolveApplicationForJob,
  filterApplicationsForOwnedJobs,
  type Db,
} from "@/server/actions/helpers";
import {
  candidateProfiles,
  candidateSkills,
  candidateExperiences,
  candidateExperienceBullets,
  candidateProjects,
  candidateEducation,
  profileEvidence,
  resumeDocuments,
  resumeVersions,
  jobs,
  jobRequirements,
  matchAnalyses,
  applications,
  applicationAnswers,
  tailoringSuggestions,
  aiRuns,
  savedBoards,
} from "@/db/schema";
import { getUser } from "@/lib/supabase/server";
import { previewJobImport, persistDiscoveredJob } from "@/modules/ingestion";
import { runAndSaveMatchAnalysisDb } from "@/modules/matching/save-match-analysis";
import type { NormalizedJob } from "@/modules/ingestion";
import { extractResumeText, MAX_RESUME_BYTES, MIN_RESUME_TEXT_LENGTH } from "@/modules/resumes/extract";
import { extractProfileFromResume, computeInputHash } from "@/modules/ai/client";
import { generateTailoringSuggestions, draftApplicationAnswer } from "@/modules/ai/client";
import { detectUnsupportedClaims } from "@/modules/ai/schemas";
import { normalizeSkillCategory, extractEvidenceSkills } from "@/modules/candidate/skills";
import type { ApplicationStatus } from "@/lib/utils";
import { parseOptionalInt } from "@/lib/utils";
import { uploadResumeFile, deleteResumeFile } from "@/modules/resumes/storage";
import { wipeExtractedProfileData } from "@/modules/resumes/profile-wipe";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function getOrCreateProfileDb(db: Db, userId: string) {
  const existing = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    with: {
      skills: true,
      experiences: { with: { bullets: true } },
      projects: true,
      education: true,
      evidence: true,
    },
  });

  if (existing) return existing;

  const [profile] = await db
    .insert(candidateProfiles)
    .values({ userId })
    .returning();

  return profile;
}

export async function getOrCreateProfile() {
  const user = await requireUser();
  return withUserDb(user.id, (db) => getOrCreateProfileDb(db, user.id));
}

export async function updateProfile(data: {
  displayName?: string;
  location?: string;
  workAuthorization?: string;
  targetTitles?: string[];
  preferredSeniority?: string;
  remotePreference?: string;
  preferredLocations?: string[];
  minimumSalary?: number;
  yearsExperience?: number;
  summary?: string;
  dealBreakers?: string[];
}) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);

    await db
      .update(candidateProfiles)
      .set({
        ...data,
        minimumSalary: parseOptionalInt(data.minimumSalary),
        yearsExperience: parseOptionalInt(data.yearsExperience),
        updatedAt: new Date(),
      })
      .where(and(eq(candidateProfiles.id, profile.id), eq(candidateProfiles.userId, user.id)));

    revalidatePath("/profile");
    return { success: true, profileUpdated: true };
  });
}

export async function uploadResume(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("File too large. Maximum size is 5 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractResumeText(buffer);
  if (extracted.text.trim().length < MIN_RESUME_TEXT_LENGTH) {
    throw new Error("Could not extract enough text from resume. Try a different file.");
  }

  const storagePath = await uploadResumeFile(
    user.id,
    file.name,
    buffer,
    file.type || "application/octet-stream"
  );

  return withUserDb(user.id, async (db) => {
    const [doc] = await db
      .insert(resumeDocuments)
      .values({
        userId: user.id,
        storagePath,
        fileName: file.name,
        fileType: extracted.fileType,
        fileSize: file.size,
        extractedText: extracted.text,
        parserVersion: extracted.parserVersion,
      })
      .returning();

    await db.insert(resumeVersions).values({
      userId: user.id,
      resumeDocumentId: doc.id,
      name: "Master Resume",
      versionType: "master",
      contentText: extracted.text,
    });

    const suggestions = await extractProfileFromResume(extracted.text);

    await db.insert(aiRuns).values({
      userId: user.id,
      taskType: "resume.extract_profile",
      promptVersion: "resume.extract_profile.v1",
      inputHash: computeInputHash("resume", extracted.text),
      inputSummary: `Resume: ${file.name}`,
      output: suggestions,
      status: "completed",
    });

    return { documentId: doc.id, extractedText: extracted.text, suggestions };
  });
}

export async function listResumeDocuments() {
  const user = await requireUser();
  return withUserDb(user.id, (db) =>
    db.query.resumeDocuments.findMany({
      where: eq(resumeDocuments.userId, user.id),
      orderBy: [desc(resumeDocuments.createdAt)],
    })
  );
}

export async function deleteResumeDocument(
  documentId: string,
  options?: { wipeExtractedData?: boolean }
) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const doc = await db.query.resumeDocuments.findFirst({
      where: and(eq(resumeDocuments.id, documentId), eq(resumeDocuments.userId, user.id)),
    });
    if (!doc) throw new Error("Resume not found");

    const versions = await db.query.resumeVersions.findMany({
      where: eq(resumeVersions.resumeDocumentId, documentId),
    });
    const versionIds = versions.map((v) => v.id);

    if (versionIds.length > 0) {
      await db
        .update(applications)
        .set({ resumeVersionId: null })
        .where(
          and(
            eq(applications.userId, user.id),
            inArray(applications.resumeVersionId, versionIds)
          )
        );
    }

    for (const version of versions) {
      await db.delete(resumeVersions).where(eq(resumeVersions.id, version.id));
    }

    if (doc.storagePath) {
      await deleteResumeFile(doc.storagePath);
    }

    await db.delete(resumeDocuments).where(eq(resumeDocuments.id, documentId));

    if (options?.wipeExtractedData) {
      const profile = await getOrCreateProfileDb(db, user.id);
      await wipeExtractedProfileData(db, profile.id);
    }

    revalidatePath("/resumes");
    revalidatePath("/profile");
    return { success: true };
  });
}

export async function applyResumeSuggestions(
  suggestions: Awaited<ReturnType<typeof extractProfileFromResume>>,
  rawResumeText: string
) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);

  await wipeExtractedProfileData(db, profile.id);

  await db
    .update(candidateProfiles)
    .set({
      displayName: suggestions?.displayName,
      location: suggestions?.location,
      workAuthorization: suggestions?.workAuthorization,
      targetTitles: suggestions?.targetTitles ?? [],
      preferredSeniority: suggestions?.preferredSeniority,
      remotePreference: suggestions?.remotePreference,
      yearsExperience: parseOptionalInt(suggestions?.yearsExperience),
      summary: suggestions?.summary,
      rawResumeText: rawResumeText,
      updatedAt: new Date(),
    })
    .where(eq(candidateProfiles.id, profile.id));

  if (suggestions?.skills) {
    for (const skill of suggestions.skills) {
      await db.insert(candidateSkills).values({
        profileId: profile.id,
        name: skill.name,
        category: normalizeSkillCategory(skill.category, skill.name),
        proficiency: skill.proficiency,
        yearsExperience: parseOptionalInt(skill.yearsExperience),
      });
    }
  }

  if (suggestions?.experiences) {
    for (const exp of suggestions.experiences) {
      const [experience] = await db
        .insert(candidateExperiences)
        .values({
          profileId: profile.id,
          company: exp.company,
          title: exp.title,
          startDate: exp.startDate,
          endDate: exp.endDate,
          location: exp.location,
        })
        .returning();

      for (const bullet of exp.bullets ?? []) {
        const normalizedSkills = extractEvidenceSkills(bullet);
        const [b] = await db
          .insert(candidateExperienceBullets)
          .values({
            experienceId: experience.id,
            text: bullet,
            skills: normalizedSkills,
          })
          .returning();

        await db.insert(profileEvidence).values({
          profileId: profile.id,
          sourceType: "resume_bullet",
          sourceId: b.id,
          evidenceText: bullet,
          normalizedSkills,
        });
      }
    }
  }

  if (suggestions?.projects) {
    for (const project of suggestions.projects) {
      const [proj] = await db
        .insert(candidateProjects)
        .values({
          profileId: profile.id,
          name: project.name,
          description: project.description,
          skills: project.skills ?? [],
        })
        .returning();

      if (project.description) {
        await db.insert(profileEvidence).values({
          profileId: profile.id,
          sourceType: "project",
          sourceId: proj.id,
          evidenceText: project.description,
          normalizedSkills: (project.skills ?? []).map((s) => s.toLowerCase()),
        });
      }
    }
  }

  if (suggestions?.education) {
    for (const edu of suggestions.education) {
      await db.insert(candidateEducation).values({
        profileId: profile.id,
        institution: edu.institution,
        degree: edu.degree,
        field: edu.field,
        endDate: edu.endDate,
      });
    }
  }

  revalidatePath("/profile");
  revalidatePath("/onboarding");
  return { success: true, profileUpdated: true };
  });
}

export async function previewJobImportAction(input: string) {
  await requireUser();
  const { raw, normalized, adapter } = await previewJobImport(input);
  return {
    normalized,
    provider: adapter.provider,
    sourceUrl: raw.sourceUrl,
    sourceJobId: raw.sourceJobId,
    rawPayload: raw.rawPayload,
  };
}

export async function confirmJobImportAction(
  normalized: NormalizedJob,
  meta: {
    provider: string;
    sourceUrl?: string;
    sourceJobId?: string;
    rawPayload?: unknown;
  }
) {
  const user = await requireUser();

  return withUserDb(user.id, async (db) => {
    const result = await persistDiscoveredJob(db, user.id, normalized, meta);

    if (result.isNew) {
      await runAndSaveMatchAnalysisDb(db, user.id, result.jobId);
    }

    revalidatePath("/jobs");
    return { jobId: result.jobId, isNew: result.isNew };
  });
}

/** @deprecated use previewJobImportAction + confirmJobImportAction */
export async function importJobPost(input: string) {
  const preview = await previewJobImportAction(input);
  return confirmJobImportAction(preview.normalized, {
    provider: preview.provider,
    sourceUrl: preview.sourceUrl,
    sourceJobId: preview.sourceJobId,
    rawPayload: preview.rawPayload,
  });
}

export async function runAndSaveMatchAnalysis(
  jobId: string,
  reqs?: Array<{
    id: string;
    requirementType: string;
    text: string;
    normalizedSkill: string | null;
    importance: string | null;
    isHardRequirement: boolean | null;
  }>
) {
  const user = await requireUser();
  return withUserDb(user.id, (db) => runAndSaveMatchAnalysisDb(db, user.id, jobId, reqs));
}

export async function rematchJobAction(jobId: string) {
  const user = await requireUser();
  const result = await withUserDb(user.id, async (db) => {
    await requireOwnedJob(db, user.id, jobId);
    return runAndSaveMatchAnalysisDb(db, user.id, jobId);
  });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return result;
}

export async function getJobsFeed(filters?: {
  minScore?: number;
  remoteOnly?: boolean;
  canadaOnly?: boolean;
  classification?: string;
  source?: "discovered" | "manual";
  sort?: "match" | "recent" | "salary";
}) {
  const user = await requireUser();
  const discoveryProviders = new Set(["greenhouse", "lever", "ashby"]);

  return withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);

    const allJobs = await db.query.jobs.findMany({
      where: eq(jobs.userId, user.id),
      orderBy: [desc(jobs.dateDiscovered)],
      with: {
        company: true,
        source: true,
        requirements: {
          columns: {
            id: true,
            requirementType: true,
            normalizedSkill: true,
            text: true,
          },
        },
        matchAnalyses: {
          orderBy: [desc(matchAnalyses.createdAt)],
          limit: 1,
        },
      },
    });

    let filtered = allJobs;

    if (filters?.source === "discovered") {
      filtered = filtered.filter((j) =>
        j.source?.provider ? discoveryProviders.has(j.source.provider) : false
      );
    } else if (filters?.source === "manual") {
      filtered = filtered.filter(
        (j) => !j.source?.provider || !discoveryProviders.has(j.source.provider)
      );
    }

    if (filters?.minScore) {
      filtered = filtered.filter(
        (j) => (j.matchAnalyses[0]?.overallScore ?? 0) >= filters.minScore!
      );
    }
    if (filters?.remoteOnly) {
      filtered = filtered.filter((j) => j.workplaceType === "remote");
    }
    if (filters?.canadaOnly) {
      filtered = filtered.filter((j) => {
        const loc = (j.location ?? "").toLowerCase();
        return (
          loc.includes("canada") ||
          loc.includes("toronto") ||
          loc.includes("vancouver") ||
          loc.includes("montreal") ||
          loc.includes("remote - canada")
        );
      });
    }
    if (filters?.classification) {
      filtered = filtered.filter(
        (j) => j.matchAnalyses[0]?.classification === filters.classification
      );
    }

    if (filters?.sort === "match") {
      filtered.sort(
        (a, b) =>
          (b.matchAnalyses[0]?.overallScore ?? 0) -
          (a.matchAnalyses[0]?.overallScore ?? 0)
      );
    } else if (filters?.sort === "salary") {
      filtered.sort((a, b) => (b.salaryMax ?? 0) - (a.salaryMax ?? 0));
    }

    return {
      jobs: filtered,
      profileUpdatedAt: profile.updatedAt,
    };
  });
}

import type { JobWithRelations } from "@/modules/jobs/types";

export async function getJobDetail(jobId: string): Promise<JobWithRelations | undefined> {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.userId, user.id)),
    with: {
      company: true,
      requirements: true,
      matchAnalyses: {
        orderBy: [desc(matchAnalyses.createdAt)],
        limit: 1,
        with: {
          categoryScores: true,
          requirementMatches: {
            with: {
              requirement: true,
              evidence: true,
            },
          },
        },
      },
    },
  });

  return job as JobWithRelations | undefined;
  });
}

export async function toggleSaveJob(jobId: string, saved: boolean) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    await requireOwnedJob(db, user.id, jobId);

    await db
      .update(jobs)
      .set({ isSaved: saved, updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, user.id)));

    if (saved) {
      const existing = await getApplicationForJob(db, user.id, jobId);
      if (!existing) {
        await db.insert(applications).values({
          userId: user.id,
          jobId,
          status: "saved",
          dateSaved: new Date(),
        });
      }
    }

    revalidatePath("/jobs");
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/applications");
  });
}

export async function getApplications() {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const rows = await db.query.applications.findMany({
      where: eq(applications.userId, user.id),
      orderBy: [desc(applications.updatedAt)],
      with: {
        job: { with: { company: true, matchAnalyses: { limit: 1 } } },
      },
    });
    return filterApplicationsForOwnedJobs(user.id, rows);
  });
}

async function getOrCreateApplicationForJobDb(db: Db, userId: string, jobId: string) {
  return resolveApplicationForJob(db, userId, jobId);
}

export async function getApplicationForJobAction(jobId: string) {
  const user = await requireUser();
  return withUserDb(user.id, (db) => getApplicationForJob(db, user.id, jobId));
}

export async function getOrCreateApplicationForJob(jobId: string) {
  const user = await requireUser();
  return withUserDb(user.id, (db) => getOrCreateApplicationForJobDb(db, user.id, jobId));
}

export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
  notes?: string
) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const app = await db.query.applications.findFirst({
      where: and(eq(applications.id, applicationId), eq(applications.userId, user.id)),
    });
    if (!app) throw new Error("Application not found");

    await requireOwnedJob(db, user.id, app.jobId);

    const updates: Record<string, unknown> = { status, updatedAt: new Date() };
    if (notes !== undefined) updates.notes = notes;
    if (status === "applied") updates.dateApplied = new Date();

    await db
      .update(applications)
      .set(updates)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, user.id)));

    revalidatePath("/applications");
  });
}

export async function getTailoringSuggestions(jobId: string) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);
    await requireOwnedJob(db, user.id, jobId);

    return db.query.tailoringSuggestions.findMany({
      where: and(
        eq(tailoringSuggestions.jobId, jobId),
        eq(tailoringSuggestions.profileId, profile.id)
      ),
      with: { evidence: true },
      orderBy: [desc(tailoringSuggestions.createdAt)],
    });
  });
}

export async function generateTailoring(jobId: string) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);
    const job = await requireOwnedJob(db, user.id, jobId);

    await db
      .delete(tailoringSuggestions)
      .where(
        and(
          eq(tailoringSuggestions.jobId, jobId),
          eq(tailoringSuggestions.profileId, profile.id)
        )
      );

    const experiences = await db.query.candidateExperiences.findMany({
      where: eq(candidateExperiences.profileId, profile.id),
      with: { bullets: true },
    });

    const evidence = await db.query.profileEvidence.findMany({
      where: eq(profileEvidence.profileId, profile.id),
    });

    const bullets = experiences.flatMap((e) =>
      e.bullets.map((b) => ({ id: b.id, text: b.text }))
    );

    const suggestions = await generateTailoringSuggestions(
      job.description ?? "",
      evidence.map((e) => ({ id: e.id, evidenceText: e.evidenceText })),
      bullets
    );

    for (const s of suggestions) {
      await db.insert(tailoringSuggestions).values({
        jobId,
        profileId: profile.id,
        suggestionType: s.suggestionType,
        originalText: s.originalText,
        suggestedText: s.suggestedText,
        evidenceId: s.evidenceId,
        bulletId: s.bulletId,
        confidence: s.confidence,
      });
    }

    revalidatePath(`/jobs/${jobId}`);
    return db.query.tailoringSuggestions.findMany({
      where: and(
        eq(tailoringSuggestions.jobId, jobId),
        eq(tailoringSuggestions.profileId, profile.id)
      ),
      with: { evidence: true },
      orderBy: [desc(tailoringSuggestions.createdAt)],
    });
  });
}

export async function updateTailoringDecision(
  suggestionId: string,
  decision: "accepted" | "rejected"
) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);

    const suggestion = await db.query.tailoringSuggestions.findFirst({
      where: eq(tailoringSuggestions.id, suggestionId),
    });
    if (!suggestion || suggestion.profileId !== profile.id) {
      throw new Error("Suggestion not found");
    }

    await requireOwnedJob(db, user.id, suggestion.jobId);

    await db
      .update(tailoringSuggestions)
      .set({ decision })
      .where(eq(tailoringSuggestions.id, suggestionId));

    revalidatePath(`/jobs/${suggestion.jobId}`);
  });
}

export async function getApplicationAnswers(applicationId: string | null) {
  if (!applicationId) return [];

  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const app = await db.query.applications.findFirst({
      where: and(eq(applications.id, applicationId), eq(applications.userId, user.id)),
    });
    if (!app) return [];

    await requireOwnedJob(db, user.id, app.jobId);

    const profile = await getOrCreateProfileDb(db, user.id);
    const rows = await db.query.applicationAnswers.findMany({
      where: eq(applicationAnswers.applicationId, applicationId),
      orderBy: [desc(applicationAnswers.updatedAt)],
    });

    const allEvidenceIds = [
      ...new Set(rows.flatMap((r) => r.evidenceIds ?? [])),
    ];
    const evidenceRows =
      allEvidenceIds.length > 0
        ? await db.query.profileEvidence.findMany({
            where: and(
              eq(profileEvidence.profileId, profile.id),
              inArray(profileEvidence.id, allEvidenceIds)
            ),
          })
        : [];
    const evidenceById = new Map(evidenceRows.map((e) => [e.id, e.evidenceText]));

    return rows.map((row) => ({
      ...row,
      evidenceTexts: (row.evidenceIds ?? [])
        .map((id) => evidenceById.get(id))
        .filter(Boolean) as string[],
      unsupportedClaims: row.unsupportedClaims ?? [],
    }));
  });
}

async function saveApplicationAnswerDb(
  db: Db,
  userId: string,
  jobId: string,
  question: string,
  answer: string,
  applicationId?: string,
  evidenceIds?: string[],
  unsupportedClaims?: string[]
) {
  const resolvedApp = await resolveApplicationForJob(db, userId, jobId, applicationId);

  const existing = await db.query.applicationAnswers.findFirst({
    where: and(
      eq(applicationAnswers.applicationId, resolvedApp.id),
      eq(applicationAnswers.question, question)
    ),
  });

  const resolvedEvidenceIds = evidenceIds ?? existing?.evidenceIds ?? [];
  const resolvedClaims = unsupportedClaims ?? existing?.unsupportedClaims ?? [];

  if (existing) {
    await db
      .update(applicationAnswers)
      .set({
        draftAnswer: answer,
        evidenceIds: resolvedEvidenceIds,
        unsupportedClaims: resolvedClaims,
        updatedAt: new Date(),
      })
      .where(eq(applicationAnswers.id, existing.id));
  } else {
    await db.insert(applicationAnswers).values({
      applicationId: resolvedApp.id,
      question,
      draftAnswer: answer,
      evidenceIds: resolvedEvidenceIds,
      unsupportedClaims: resolvedClaims,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  return resolvedApp.id;
}

export async function saveApplicationAnswer(
  jobId: string,
  question: string,
  answer: string,
  applicationId?: string,
  evidenceIds?: string[]
) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);
    const job = await requireOwnedJob(db, user.id, jobId);

    const resolvedApp = await resolveApplicationForJob(
      db,
      user.id,
      jobId,
      applicationId
    );

    const existing = await db.query.applicationAnswers.findFirst({
      where: and(
        eq(applicationAnswers.applicationId, resolvedApp.id),
        eq(applicationAnswers.question, question)
      ),
    });

    const keptEvidenceIds = evidenceIds ?? existing?.evidenceIds ?? [];
    const evidenceRows =
      keptEvidenceIds.length > 0
        ? await db.query.profileEvidence.findMany({
            where: and(
              eq(profileEvidence.profileId, profile.id),
              inArray(profileEvidence.id, keptEvidenceIds)
            ),
          })
        : [];

    const citedTexts = evidenceRows.map((e) => e.evidenceText);
    const unsupportedClaims = detectUnsupportedClaims(
      answer,
      citedTexts,
      job.description ?? ""
    );

    const appId = await saveApplicationAnswerDb(
      db,
      user.id,
      jobId,
      question,
      answer,
      applicationId,
      keptEvidenceIds,
      unsupportedClaims
    );

    return {
      applicationId: appId,
      unsupportedClaims,
      evidenceTexts: citedTexts,
    };
  });
}

export async function draftAnswer(
  jobId: string,
  question: string,
  applicationId?: string
) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const profile = await getOrCreateProfileDb(db, user.id);
    const job = await requireOwnedJob(db, user.id, jobId);

    const evidenceRows = await db.query.profileEvidence.findMany({
      where: eq(profileEvidence.profileId, profile.id),
    });

    const { answer, evidenceIds, unsupportedClaims } = await draftApplicationAnswer(
      question,
      profile.summary ?? "",
      job.description ?? "",
      evidenceRows.map((e) => ({ id: e.id, evidenceText: e.evidenceText }))
    );

    const appId = await saveApplicationAnswerDb(
      db,
      user.id,
      jobId,
      question,
      answer,
      applicationId,
      evidenceIds,
      unsupportedClaims
    );

    return {
      answer,
      applicationId: appId,
      evidenceIds,
      unsupportedClaims,
      evidenceTexts: evidenceRows
        .filter((e) => evidenceIds.includes(e.id))
        .map((e) => e.evidenceText),
    };
  });
}

export async function getDashboardStats() {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const allJobs = await db.query.jobs.findMany({
      where: eq(jobs.userId, user.id),
      with: { matchAnalyses: { limit: 1 } },
    });

    const apps = await db.query.applications.findMany({
      where: eq(applications.userId, user.id),
    });

    const strongMatches = allJobs.filter(
      (j) =>
        j.matchAnalyses[0]?.classification === "excellent" ||
        j.matchAnalyses[0]?.classification === "strong"
    ).length;

    return {
      totalJobs: allJobs.length,
      savedJobs: allJobs.filter((j) => j.isSaved).length,
      strongMatches,
      applicationsSubmitted: apps.filter((a) => a.status === "applied").length,
      interviews: apps.filter((a) =>
        ["recruiter_screen", "technical_interview", "final_interview"].includes(a.status)
      ).length,
      offers: apps.filter((a) => a.status === "offer").length,
    };
  });
}

export async function getSavedBoards() {
  const user = await requireUser();
  return withUserDb(user.id, (db) =>
    db.query.savedBoards.findMany({
      where: eq(savedBoards.userId, user.id),
    })
  );
}

export async function addSavedBoard(data: {
  companyName: string;
  boardUrl: string;
  provider: "greenhouse" | "lever" | "ashby";
}) {
  const user = await requireUser();
  const boardUrl = data.boardUrl.trim();
  if (!/^https?:\/\//i.test(boardUrl)) {
    throw new Error("Board URL must start with http:// or https://");
  }

  return withUserDb(user.id, async (db) => {
    await db.insert(savedBoards).values({
      userId: user.id,
      companyName: data.companyName.trim(),
      boardUrl,
      provider: data.provider,
    });

    revalidatePath("/settings");
  });
}

export async function deleteSavedBoard(boardId: string) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const board = await db.query.savedBoards.findFirst({
      where: and(eq(savedBoards.id, boardId), eq(savedBoards.userId, user.id)),
    });
    if (!board) throw new Error("Board not found");

    await db.delete(savedBoards).where(eq(savedBoards.id, boardId));
    revalidatePath("/settings");
  });
}

export async function updateSavedBoard(
  boardId: string,
  data: { isActive?: boolean; companyName?: string; boardUrl?: string; provider?: "greenhouse" | "lever" | "ashby" }
) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const board = await db.query.savedBoards.findFirst({
      where: and(eq(savedBoards.id, boardId), eq(savedBoards.userId, user.id)),
    });
    if (!board) throw new Error("Board not found");

    await db
      .update(savedBoards)
      .set({
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName.trim() } : {}),
        ...(data.boardUrl !== undefined ? { boardUrl: data.boardUrl.trim() } : {}),
        ...(data.provider !== undefined ? { provider: data.provider } : {}),
      })
      .where(eq(savedBoards.id, boardId));

    revalidatePath("/settings");
  });
}

export async function detectBoardProviderAction(url: string) {
  await requireUser();
  const { detectBestAdapter } = await import("@/modules/ingestion/adapters");
  const adapter = await detectBestAdapter(url.trim());
  return {
    provider: adapter.provider,
    reason: (await adapter.detect(url.trim())).reason,
  };
}

export async function pollSavedBoardNow(boardId: string) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const board = await db.query.savedBoards.findFirst({
      where: and(eq(savedBoards.id, boardId), eq(savedBoards.userId, user.id)),
    });
    if (!board) throw new Error("Board not found");

    const { pollSavedBoard } = await import("@/modules/discovery/poll-board");
    const { CRON_MAX_NEW_JOBS_PER_RUN } = await import("@/lib/cron-discover");

    const stats = await pollSavedBoard(
      db,
      user.id,
      {
        id: board.id,
        boardUrl: board.boardUrl,
        provider: board.provider,
        companyName: board.companyName,
      },
      { remainingNewJobs: CRON_MAX_NEW_JOBS_PER_RUN }
    );

    revalidatePath("/settings");
    revalidatePath("/jobs");
    return stats;
  });
}

export async function signOut() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
}
