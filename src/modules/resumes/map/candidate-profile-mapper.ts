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

  const skillRows = cleaned.skillGroups.flatMap((group) =>
    group.skills.map((skillName) => ({
      profileId: profile.id,
      name: skillName,
      category: normalizeSkillCategory(group.category ?? "other", skillName),
    }))
  );
  if (skillRows.length > 0) {
    await db.insert(candidateSkills).values(skillRows);
  }

  const experienceRows = cleaned.experience.map((exp) => ({
    profileId: profile.id,
    company: exp.company ?? "Unknown",
    title: exp.title ?? "Role",
    startDate: exp.startDateText ?? exp.startDate,
    endDate: exp.endDateText ?? exp.endDate,
    location: exp.location,
  }));

  const insertedExperiences =
    experienceRows.length > 0
      ? await db.insert(candidateExperiences).values(experienceRows).returning()
      : [];

  const bulletRows: Array<{
    experienceId: string;
    text: string;
    skills: string[];
    sourceResumeId: string | null;
    sourceEvidenceJson: unknown;
    achievement: string;
    normalizedSkills: string[];
  }> = [];

  for (let i = 0; i < cleaned.experience.length; i++) {
    const exp = cleaned.experience[i];
    const experienceId = insertedExperiences[i]?.id;
    if (!experienceId) continue;

    for (const achievement of exp.achievements) {
      const normalizedSkills = [
        ...new Set([
          ...extractEvidenceSkills(achievement),
          ...exp.technologies.map((t) => t.toLowerCase()),
        ]),
      ];
      bulletRows.push({
        experienceId,
        text: achievement,
        skills: normalizedSkills,
        sourceResumeId: resumeDocumentId ?? null,
        sourceEvidenceJson: exp.sourceEvidence.length ? exp.sourceEvidence : null,
        achievement,
        normalizedSkills,
      });
    }
  }

  const insertedBullets =
    bulletRows.length > 0
      ? await db
          .insert(candidateExperienceBullets)
          .values(
            bulletRows.map(({ achievement: _a, normalizedSkills: _n, ...row }) => row)
          )
          .returning()
      : [];

  const bulletEvidenceRows = insertedBullets.map((bullet, index) => ({
    profileId: profile.id,
    sourceType: "resume_bullet" as const,
    sourceId: bullet.id,
    evidenceText: bulletRows[index].achievement,
    normalizedSkills: bulletRows[index].normalizedSkills,
  }));
  if (bulletEvidenceRows.length > 0) {
    await db.insert(profileEvidence).values(bulletEvidenceRows);
  }

  const projectRows = cleaned.projects.map((project) => ({
    profileId: profile.id,
    name: project.name,
    description: project.description,
    skills: project.technologies,
  }));
  const insertedProjects =
    projectRows.length > 0
      ? await db.insert(candidateProjects).values(projectRows).returning()
      : [];

  const projectEvidenceRows = insertedProjects
    .map((proj, index) => {
      const description = cleaned.projects[index]?.description;
      if (!description) return null;
      return {
        profileId: profile.id,
        sourceType: "project" as const,
        sourceId: proj.id,
        evidenceText: description,
        normalizedSkills: cleaned.projects[index].technologies.map((s) => s.toLowerCase()),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (projectEvidenceRows.length > 0) {
    await db.insert(profileEvidence).values(projectEvidenceRows);
  }

  const educationRows = cleaned.education.map((edu) => ({
    profileId: profile.id,
    institution: edu.institution ?? "Unknown",
    degree: edu.qualification,
    field: edu.fieldOfStudy,
    endDate: edu.endDateText,
    startDate: edu.startDateText,
    location: edu.location,
  }));
  if (educationRows.length > 0) {
    await db.insert(candidateEducation).values(educationRows);
  }

  const certificationRows = cleaned.certifications.map((cert) => ({
    profileId: profile.id,
    name: cert.name,
    issuer: cert.issuer,
    issuedDateText: cert.issuedDateText,
    expirationDateText: cert.expirationDateText,
    credentialId: cert.credentialId,
    credentialUrl: cert.credentialUrl,
    sourceEvidenceJson: cert.sourceEvidence.length ? cert.sourceEvidence : null,
  }));
  const insertedCertifications =
    certificationRows.length > 0
      ? await db.insert(candidateCertifications).values(certificationRows).returning()
      : [];

  const certificationEvidenceRows = insertedCertifications.map((row) => ({
    profileId: profile.id,
    sourceType: "certification" as const,
    sourceId: row.id,
    evidenceText: row.name,
    normalizedSkills: [] as string[],
  }));
  if (certificationEvidenceRows.length > 0) {
    await db.insert(profileEvidence).values(certificationEvidenceRows);
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

  if (version.status === "processing") {
    throw new Error("Resume is still parsing. Wait for parsing to finish.");
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
