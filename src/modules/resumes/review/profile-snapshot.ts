import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";

export const PROFILE_SECTIONS = [
  "contact",
  "summary",
  "skills",
  "experience",
  "education",
  "certifications",
  "projects",
] as const;

export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number];

export type ProfileSnapshot = {
  displayName: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experience: Array<{
    company: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
    bullets: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string | null;
    field: string | null;
    endDate: string | null;
  }>;
  certifications: Array<{
    name: string;
    issuer: string | null;
    credentialId: string | null;
  }>;
  projects: Array<{
    name: string;
    description: string | null;
  }>;
};

export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function emptyProfileSnapshot(): ProfileSnapshot {
  return {
    displayName: null,
    location: null,
    summary: null,
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    projects: [],
  };
}

export function sectionSummary(section: ProfileSectionKey, profile: ProfileSnapshot): string {
  switch (section) {
    case "contact":
      return [profile.displayName, profile.location].filter(Boolean).join("\n") || "—";
    case "summary":
      return profile.summary || "—";
    case "skills":
      return profile.skills.join(", ") || "—";
    case "experience":
      return (
        profile.experience
          .map((role) => {
            const dates = [role.startDate, role.endDate].filter(Boolean).join(" – ");
            const bullets = role.bullets.slice(0, 3).map((bullet) => `• ${bullet}`);
            return [`${role.title} at ${role.company}`, dates, role.location, ...bullets]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n") || "—"
      );
    case "education":
      return (
        profile.education
          .map((entry) =>
            [entry.degree, entry.field, entry.institution, entry.endDate].filter(Boolean).join(" · ")
          )
          .join("\n") || "—"
      );
    case "certifications":
      return (
        profile.certifications
          .map((cert) =>
            [cert.name, cert.issuer, cert.credentialId ? `ID ${cert.credentialId}` : null]
              .filter(Boolean)
              .join(" · ")
          )
          .join("\n") || "—"
      );
    case "projects":
      return (
        profile.projects
          .map((project) => [project.name, project.description].filter(Boolean).join(" — "))
          .join("\n") || "—"
      );
    default:
      return "—";
  }
}

export function parsedSectionSummary(section: ProfileSectionKey, parsed: ParsedResume): string {
  switch (section) {
    case "contact":
      return (
        [
          parsed.contact.fullName,
          parsed.contact.headline,
          parsed.contact.email,
          parsed.contact.phone,
          parsed.contact.location,
          parsed.contact.linkedInUrl,
          parsed.contact.githubUrl,
        ]
          .filter(Boolean)
          .join("\n") || "—"
      );
    case "summary":
      return parsed.professionalSummary || "—";
    case "skills":
      return (
        parsed.skillGroups
          .map((group) => {
            const label = group.category ? `${group.category}: ` : "";
            return `${label}${group.skills.join(", ")}`;
          })
          .join("\n") || "—"
      );
    case "experience":
      return (
        parsed.experience
          .map((role) => {
            const dates = [role.startDateText, role.endDateText].filter(Boolean).join(" – ");
            const bullets = role.achievements.slice(0, 3).map((bullet) => `• ${bullet}`);
            return [`${role.title ?? "Role"} at ${role.company ?? "Unknown"}`, dates, role.location, ...bullets]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n") || "—"
      );
    case "education":
      return (
        parsed.education
          .map((entry) =>
            [entry.qualification, entry.fieldOfStudy, entry.institution, entry.endDateText]
              .filter(Boolean)
              .join(" · ")
          )
          .join("\n") || "—"
      );
    case "certifications":
      return (
        parsed.certifications
          .map((cert) =>
            [cert.name, cert.issuer, cert.credentialId ? `ID ${cert.credentialId}` : null]
              .filter(Boolean)
              .join(" · ")
          )
          .join("\n") || "—"
      );
    case "projects":
      return (
        parsed.projects
          .map((project) => [project.name, project.description].filter(Boolean).join(" — "))
          .join("\n") || "—"
      );
    default:
      return "—";
  }
}
