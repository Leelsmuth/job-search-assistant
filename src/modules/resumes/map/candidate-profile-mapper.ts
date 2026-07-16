import type { Db } from "@/server/actions/helpers";
import { eq } from "drizzle-orm";
import {
  candidateProfiles,
  candidateSkills,
  candidateExperiences,
  candidateExperienceBullets,
  candidateProjects,
  candidateEducation,
  candidateCertifications,
  profileEvidence,
  parsedResumeVersions,
  resumeDocuments,
} from "@/db/schema";
import {
  sanitizeParsedResume,
  type ParsedResume,
} from "@/modules/resumes/schema/resume-schema";
import { normalizeSkillCategory, extractEvidenceSkills } from "@/modules/candidate/skills";
import { wipeExtractedProfileData } from "@/modules/resumes/profile-wipe";
import { getOrCreateProfileDb } from "@/server/actions/helpers";

export async function mapParsedResumeToProfile(
  db: Db,
  userId: string,
  parsed: ParsedResume,
  rawResumeText: string,
  resumeDocumentId?: string
) {
  const cleaned = sanitizeParsedResume(parsed);
  const profile = await getOrCreateProfileDb(db, userId);

  await wipeExtractedProfileData(db, profile.id);

  await db
    .update(candidateProfiles)
    .set({
      displayName: cleaned.contact.fullName,
      location: cleaned.contact.location,
      summary: cleaned.professionalSummary,
      rawResumeText,
      updatedAt: new Date(),
    })
    .where(eq(candidateProfiles.id, profile.id));

  for (const group of cleaned.skillGroups) {
    for (const skillName of group.skills) {
      await db.insert(candidateSkills).values({
        profileId: profile.id,
        name: skillName,
        category: normalizeSkillCategory(group.category ?? "other", skillName),
      });
    }
  }

  for (const exp of cleaned.experience) {
    const [experience] = await db
      .insert(candidateExperiences)
      .values({
        profileId: profile.id,
        company: exp.company ?? "Unknown",
        title: exp.title ?? "Role",
        startDate: exp.startDateText ?? exp.startDate,
        endDate: exp.endDateText ?? exp.endDate,
        location: exp.location,
      })
      .returning();

    for (const achievement of exp.achievements) {
      const normalizedSkills = [
        ...new Set([
          ...extractEvidenceSkills(achievement),
          ...exp.technologies.map((t) => t.toLowerCase()),
        ]),
      ];
      const [bullet] = await db
        .insert(candidateExperienceBullets)
        .values({
          experienceId: experience.id,
          text: achievement,
          skills: normalizedSkills,
          sourceResumeId: resumeDocumentId ?? null,
          sourceEvidenceJson: exp.sourceEvidence.length
            ? exp.sourceEvidence
            : null,
        })
        .returning();

      await db.insert(profileEvidence).values({
        profileId: profile.id,
        sourceType: "resume_bullet",
        sourceId: bullet.id,
        evidenceText: achievement,
        normalizedSkills,
      });
    }
  }

  for (const project of cleaned.projects) {
    const [proj] = await db
      .insert(candidateProjects)
      .values({
        profileId: profile.id,
        name: project.name,
        description: project.description,
        skills: project.technologies,
      })
      .returning();

    if (project.description) {
      await db.insert(profileEvidence).values({
        profileId: profile.id,
        sourceType: "project",
        sourceId: proj.id,
        evidenceText: project.description,
        normalizedSkills: project.technologies.map((s) => s.toLowerCase()),
      });
    }
  }

  for (const edu of cleaned.education) {
    await db.insert(candidateEducation).values({
      profileId: profile.id,
      institution: edu.institution ?? "Unknown",
      degree: edu.qualification,
      field: edu.fieldOfStudy,
      endDate: edu.endDateText,
      startDate: edu.startDateText,
      location: edu.location,
    });
  }

  for (const cert of cleaned.certifications) {
    const [row] = await db
      .insert(candidateCertifications)
      .values({
        profileId: profile.id,
        name: cert.name,
        issuer: cert.issuer,
        issuedDateText: cert.issuedDateText,
        expirationDateText: cert.expirationDateText,
        credentialId: cert.credentialId,
        credentialUrl: cert.credentialUrl,
        sourceEvidenceJson: cert.sourceEvidence.length ? cert.sourceEvidence : null,
      })
      .returning();

    await db.insert(profileEvidence).values({
      profileId: profile.id,
      sourceType: "certification",
      sourceId: row.id,
      evidenceText: cert.name,
      normalizedSkills: [],
    });
  }

  if (cleaned.professionalSummary) {
    await db.insert(profileEvidence).values({
      profileId: profile.id,
      sourceType: "summary",
      sourceId: null,
      evidenceText: cleaned.professionalSummary,
      normalizedSkills: [],
    });
  }

  return profile.id;
}

export async function approveParsedResumeVersion(
  db: Db,
  userId: string,
  parsedVersionId: string,
  editedParsed: ParsedResume
) {
  const version = await db.query.parsedResumeVersions.findFirst({
    where: eq(parsedResumeVersions.id, parsedVersionId),
    with: {
      extraction: true,
    },
  });

  if (!version || version.userId !== userId) {
    throw new Error("Parsed resume version not found.");
  }

  const cleaned = sanitizeParsedResume(editedParsed);
  const rawText = version.extraction?.normalizedText ?? "";

  await mapParsedResumeToProfile(
    db,
    userId,
    cleaned,
    rawText,
    version.extraction?.resumeDocumentId ?? undefined
  );

  await db
    .update(parsedResumeVersions)
    .set({
      parsedJson: cleaned,
      confidenceJson: cleaned.confidence,
      warningsJson: cleaned.warnings,
      status: "approved",
      approvedAt: new Date(),
    })
    .where(eq(parsedResumeVersions.id, parsedVersionId));

  if (version.extraction?.resumeDocumentId) {
    await db
      .update(resumeDocuments)
      .set({ extractedText: rawText })
      .where(eq(resumeDocuments.id, version.extraction.resumeDocumentId));
  }

  return { success: true };
}
