"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withUserDb } from "@/db/user-context";
import { getUser } from "@/lib/supabase/server";
import {
  candidateCertifications,
  candidateEducation,
  candidateExperienceBullets,
  candidateExperiences,
  candidateProfiles,
  candidateProjects,
  candidateSkills,
} from "@/db/schema";
import {
  ingestResumeFile,
  getParsedResumeVersion,
  completeResumeParse,
  reparseStoredResume,
} from "@/modules/resumes/ingestion/resume-ingestion-service";
import { approveParsedResumeVersion } from "@/modules/resumes/map/candidate-profile-mapper";
import { getResumeSignedUrl } from "@/modules/resumes/storage";
import {
  sanitizeParsedResume,
  type ParsedResume,
} from "@/modules/resumes/schema/resume-schema";
import {
  emptyProfileSnapshot,
  PROFILE_SECTIONS,
  type ProfileSectionKey,
  type ProfileSnapshot,
} from "@/modules/resumes/review/profile-snapshot";
import { measureOperation, estimatePayloadBytes } from "@/lib/performance/measure-operation";
import { runWithPerfContextAsync } from "@/lib/performance/request-context";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

function selectedSections(sections?: string[]): ProfileSectionKey[] | undefined {
  if (!sections) return undefined;
  const allowed = new Set<string>(PROFILE_SECTIONS);
  return sections.filter((section): section is ProfileSectionKey => allowed.has(section));
}

export async function uploadResume(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  return runWithPerfContextAsync("action.uploadResume", async () =>
    measureOperation(
      "action.uploadResume",
      async () => {
        const result = await withUserDb(user.id, (db) =>
          ingestResumeFile(db, user.id, file)
        );

        if (result.processing) {
          after(async () => {
            await runWithPerfContextAsync("action.uploadResume.background", async () => {
              try {
                await withUserDb(user.id, (db) =>
                  completeResumeParse(db, user.id, result.parsedVersionId)
                );
                revalidatePath("/resumes");
                revalidatePath("/onboarding");
              } catch (error) {
                console.error("[resume] background parse failed", error);
              }
            });
          });
        }

        revalidatePath("/resumes");
        revalidatePath("/onboarding");

        return {
          documentId: result.documentId,
          extractionId: result.extractionId,
          parsedVersionId: result.parsedVersionId,
          extractedText: result.normalizedText,
          parsed: result.parsed,
          fromCache: result.fromCache,
          processing: result.processing ?? false,
          payloadBytes: estimatePayloadBytes(result),
        };
      },
      { source: "server_action" }
    )
  );
}

export async function getResumeParseReview(parsedVersionId: string) {
  const user = await requireUser();
  return runWithPerfContextAsync("action.getResumeParseReview", () =>
    withUserDb(user.id, async (db) => {
      const row = await getParsedResumeVersion(db, user.id, parsedVersionId);
      if (!row) throw new Error("Parse review not found");

      let sourcePreviewUrl: string | null = null;
      const storagePath = row.extraction?.document?.storagePath;
      if (storagePath) {
        sourcePreviewUrl = await getResumeSignedUrl(storagePath);
      }

      return {
        parsedVersionId: row.id,
        parsed: row.parsedJson as ParsedResume,
        normalizedText: row.extraction?.normalizedText ?? "",
        confidence: row.confidenceJson,
        warnings: row.warningsJson,
        status: row.status,
        sourcePreviewUrl,
        fileName: row.extraction?.document?.fileName ?? null,
      };
    })
  );
}

export async function getCurrentProfileForReview(): Promise<ProfileSnapshot> {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const profile = await db.query.candidateProfiles.findFirst({
      where: eq(candidateProfiles.userId, user.id),
    });
    if (!profile) return emptyProfileSnapshot();

    const skills = await db.query.candidateSkills.findMany({
      where: eq(candidateSkills.profileId, profile.id),
    });
    const experiences = await db.query.candidateExperiences.findMany({
      where: eq(candidateExperiences.profileId, profile.id),
    });
    const experience: ProfileSnapshot["experience"] = [];
    for (const role of experiences) {
      const bullets = await db.query.candidateExperienceBullets.findMany({
        where: eq(candidateExperienceBullets.experienceId, role.id),
      });
      experience.push({
        company: role.company,
        title: role.title,
        startDate: role.startDate,
        endDate: role.endDate,
        location: role.location,
        bullets: bullets.map((bullet) => bullet.text),
      });
    }
    const education = await db.query.candidateEducation.findMany({
      where: eq(candidateEducation.profileId, profile.id),
    });
    const certifications = await db.query.candidateCertifications.findMany({
      where: eq(candidateCertifications.profileId, profile.id),
    });
    const projects = await db.query.candidateProjects.findMany({
      where: eq(candidateProjects.profileId, profile.id),
    });

    return {
      displayName: profile.displayName,
      location: profile.location,
      summary: profile.summary,
      skills: skills.map((skill) => skill.name),
      experience,
      education: education.map((entry) => ({
        institution: entry.institution,
        degree: entry.degree,
        field: entry.field,
        endDate: entry.endDate,
      })),
      certifications: certifications.map((cert) => ({
        name: cert.name,
        issuer: cert.issuer,
        credentialId: cert.credentialId,
      })),
      projects: projects.map((project) => ({
        name: project.name,
        description: project.description,
      })),
    };
  });
}

export async function reparseResumeDocument(documentId: string) {
  const user = await requireUser();
  return runWithPerfContextAsync("action.reparseResumeDocument", () =>
    measureOperation(
      "action.reparseResumeDocument",
      async () => {
        const result = await withUserDb(user.id, (db) =>
          reparseStoredResume(db, user.id, documentId)
        );
        revalidatePath("/resumes");
        revalidatePath("/onboarding");
        return {
          documentId: result.documentId,
          extractionId: result.extractionId,
          parsedVersionId: result.parsedVersionId,
          extractedText: result.normalizedText,
          parsed: result.parsed,
          fromCache: result.fromCache,
          processing: false,
        };
      },
      { source: "server_action" }
    )
  );
}

export async function approveParsedResume(
  parsedVersionId: string,
  editedParsed: ParsedResume,
  sections?: string[]
) {
  const user = await requireUser();
  const cleaned = sanitizeParsedResume(editedParsed);
  const accepted = selectedSections(sections);

  return runWithPerfContextAsync("action.approveParsedResume", () =>
    measureOperation(
      "action.approveParsedResume",
      async () => {
        await withUserDb(user.id, (db) =>
          approveParsedResumeVersion(db, user.id, parsedVersionId, cleaned, {
            sections: accepted,
          })
        );
        revalidatePath("/profile");
        revalidatePath("/resumes");
        revalidatePath("/onboarding");
        revalidatePath("/jobs");
        return { success: true };
      },
      { source: "server_action" }
    )
  );
}

export async function uploadResumeText(text: string) {
  const user = await requireUser();
  const buffer = Buffer.from(text, "utf-8");
  const file = new File([buffer], "pasted-resume.txt", { type: "text/plain" });
  const formData = new FormData();
  formData.set("file", file);
  return uploadResume(formData);
}
