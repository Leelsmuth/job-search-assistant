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
import { sanitizeSkills } from "@/modules/candidate/sanitize-skills";
import { categoryForCanonicalSkill, extractCanonicalSkills } from "@/modules/candidate/skill-dictionary";
import { wipeExtractedProfileData } from "@/modules/resumes/profile-wipe";
import { getOrCreateProfileDb } from "@/server/actions/helpers";
import {
  PROFILE_SECTIONS,
  type ProfileSectionKey,
} from "@/modules/resumes/review/profile-snapshot";

function provenanceFor(parsed: ParsedResume, fieldPath: string, value: string) {
  const match =
    parsed.fieldProvenance?.find((item) => item.fieldPath === fieldPath) ??
    parsed.fieldProvenance?.find((item) => item.value === value);
  return {
    sourceLines: match?.sourceLines ?? [],
    sourceText: match?.sourceText || value,
    fieldPath,
  };
}

export async function mapParsedResumeToProfile(
  db: Db,
  userId: string,
  parsed: ParsedResume,
  rawResumeText: string,
  resumeDocumentId?: string,
  options?: { sections?: ProfileSectionKey[] }
) {
  const cleaned = sanitizeParsedResume(parsed);
  const profile = await getOrCreateProfileDb(db, userId);
  const selected = new Set(options?.sections ?? PROFILE_SECTIONS);

  await wipeExtractedProfileData(db, profile.id, [...selected]);

  await db
    .update(candidateProfiles)
    .set({
      ...(selected.has("contact")
        ? {
            displayName: cleaned.contact.fullName,
            location: cleaned.contact.location,
          }
        : {}),
      ...(selected.has("summary") ? { summary: cleaned.professionalSummary } : {}),
      rawResumeText,
      updatedAt: new Date(),
    })
    .where(eq(candidateProfiles.id, profile.id));

  const rawSkillNames = selected.has("skills")
    ? cleaned.skillGroups.flatMap((group) => group.skills)
    : [];
  const canonicalSkillNames = sanitizeSkills(rawSkillNames);
  const skillRows = canonicalSkillNames.map((skillName) => ({
    profileId: profile.id,
    name: skillName,
    category: categoryForCanonicalSkill(skillName) ?? normalizeSkillCategory(undefined, skillName),
  }));
  if (skillRows.length > 0) {
    await db.insert(candidateSkills).values(skillRows);
    const skillEvidence = canonicalSkillNames.map((skillName) => {
      const needle = skillName.toLowerCase();
      let fieldPath = "skillGroups";
      for (const [groupIndex, group] of cleaned.skillGroups.entries()) {
        const skillIndex = group.skills.findIndex((raw) => {
          const text = raw.toLowerCase();
          return (
            text === needle ||
            extractCanonicalSkills(raw).some((name) => name.toLowerCase() === needle)
          );
        });
        if (skillIndex >= 0) {
          fieldPath = `skillGroups.${groupIndex}.skills.${skillIndex}`;
          break;
        }
      }
      return {
        profileId: profile.id,
        sourceType: "skill" as const,
        sourceId: null,
        evidenceText: skillName,
        normalizedSkills: [needle],
        provenanceJson: provenanceFor(cleaned, fieldPath, skillName),
      };
    });
    if (skillEvidence.length > 0) {
      await db.insert(profileEvidence).values(skillEvidence);
    }
  }

  const experienceRows = selected.has("experience")
    ? cleaned.experience.map((exp) => ({
    profileId: profile.id,
    company: exp.company ?? "Unknown",
    title: exp.title ?? "Role",
    startDate: exp.startDateText ?? exp.startDate,
    endDate: exp.endDateText ?? exp.endDate,
    location: exp.location,
  }))
    : [];

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

  for (let i = 0; i < (selected.has("experience") ? cleaned.experience.length : 0); i++) {
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
    provenanceJson: provenanceFor(
      cleaned,
      `experience.${index}.achievements`,
      bulletRows[index].achievement
    ),
  }));
  if (bulletEvidenceRows.length > 0) {
    await db.insert(profileEvidence).values(bulletEvidenceRows);
  }

  const projectRows = selected.has("projects")
    ? cleaned.projects.map((project) => ({
    profileId: profile.id,
    name: project.name,
    description: project.description,
    skills: project.technologies,
  }))
    : [];
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
        provenanceJson: provenanceFor(cleaned, `projects.${index}.description`, description),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (projectEvidenceRows.length > 0) {
    await db.insert(profileEvidence).values(projectEvidenceRows);
  }

  const educationRows = selected.has("education")
    ? cleaned.education.map((edu) => ({
    profileId: profile.id,
    institution: edu.institution ?? "Unknown",
    degree: edu.qualification,
    field: edu.fieldOfStudy,
    endDate: edu.endDateText,
    startDate: edu.startDateText,
    location: edu.location,
  }))
    : [];
  if (educationRows.length > 0) {
    const insertedEducation = await db.insert(candidateEducation).values(educationRows).returning();
    const educationEvidence = insertedEducation.map((row, index) => ({
      profileId: profile.id,
      sourceType: "education" as const,
      sourceId: row.id,
      evidenceText: [row.degree, row.field, row.institution].filter(Boolean).join(" "),
      normalizedSkills: [] as string[],
      provenanceJson: provenanceFor(
        cleaned,
        `education.${index}.institution`,
        row.institution
      ),
    }));
    await db.insert(profileEvidence).values(educationEvidence);
  }

  const certificationRows = selected.has("certifications")
    ? cleaned.certifications.map((cert) => ({
    profileId: profile.id,
    name: cert.name,
    issuer: cert.issuer,
    issuedDateText: cert.issuedDateText,
    expirationDateText: cert.expirationDateText,
    credentialId: cert.credentialId,
    credentialUrl: cert.credentialUrl,
    sourceEvidenceJson: cert.sourceEvidence.length ? cert.sourceEvidence : null,
  }))
    : [];
  const insertedCertifications =
    certificationRows.length > 0
      ? await db.insert(candidateCertifications).values(certificationRows).returning()
      : [];

  const certificationEvidenceRows = insertedCertifications.map((row, index) => ({
    profileId: profile.id,
    sourceType: "certification" as const,
    sourceId: row.id,
    evidenceText: row.name,
    normalizedSkills: [] as string[],
    provenanceJson: provenanceFor(cleaned, `certifications.${index}.name`, row.name),
  }));
  if (certificationEvidenceRows.length > 0) {
    await db.insert(profileEvidence).values(certificationEvidenceRows);
  }

  if (selected.has("summary") && cleaned.professionalSummary) {
    await db.insert(profileEvidence).values({
      profileId: profile.id,
      sourceType: "summary",
      sourceId: null,
      evidenceText: cleaned.professionalSummary,
      normalizedSkills: [],
      provenanceJson: provenanceFor(cleaned, "professionalSummary", cleaned.professionalSummary),
    });
  }

  return profile.id;
}

export async function approveParsedResumeVersion(
  db: Db,
  userId: string,
  parsedVersionId: string,
  editedParsed: ParsedResume,
  options?: { sections?: ProfileSectionKey[] }
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
    version.extraction?.resumeDocumentId ?? undefined,
    options
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
