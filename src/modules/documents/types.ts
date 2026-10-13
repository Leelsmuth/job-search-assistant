export type ChangeDecision = "pending" | "accepted" | "rejected";

export type ResumeChangeKind =
  | "reorder_experiences"
  | "omit_experience"
  | "reorder_bullets"
  | "omit_bullet"
  | "rewrite_bullet"
  | "reorder_skills"
  | "omit_skill"
  | "reorder_projects"
  | "omit_project";

export type ResumeChange = {
  id: string;
  kind: ResumeChangeKind;
  label: string;
  before: string;
  after: string;
  decision: ChangeDecision;
  targetIds: string[];
};

export type TailoredBullet = {
  id: string;
  originalText: string;
  suggestedText: string;
  editedText: string | null;
  proposedIncluded: boolean;
  originalIndex: number;
  proposedIndex: number;
  score: number;
  matchedTerms: string[];
  unsupportedClaims: string[];
};

export type TailoredExperience = {
  id: string;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  originalIndex: number;
  proposedIndex: number;
  proposedIncluded: boolean;
  score: number;
  bullets: TailoredBullet[];
};

export type TailoredSkill = {
  id: string;
  name: string;
  originalIndex: number;
  proposedIndex: number;
  proposedIncluded: boolean;
  score: number;
  matchedTerms: string[];
};

export type TailoredProject = {
  id: string;
  name: string;
  description: string | null;
  skills: string[];
  originalIndex: number;
  proposedIndex: number;
  proposedIncluded: boolean;
  score: number;
  matchedTerms: string[];
};

export type TailoredEducation = {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type TailoredCertification = {
  id: string;
  name: string;
  issuer: string | null;
};

export type TailoredResumeDraft = {
  generatedAt: string;
  generationMode: "deterministic" | "llm";
  model: string | null;
  jobTitle: string;
  companyName: string | null;
  header: {
    name: string;
    location: string | null;
    headline: string | null;
  };
  summary: string | null;
  summaryBaseline: string | null;
  experiences: TailoredExperience[];
  projects: TailoredProject[];
  skills: TailoredSkill[];
  education: TailoredEducation[];
  certifications: TailoredCertification[];
  changes: ResumeChange[];
  unsupportedClaims: string[];
};

export type ResolvedExperience = {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  bullets: string[];
};

export type ResolvedResume = {
  header: {
    name: string;
    location: string | null;
    headline: string | null;
    yearsExperience: number | null;
  };
  summary: string | null;
  experiences: ResolvedExperience[];
  projects: Array<{ name: string; description: string | null; skills: string[] }>;
  skills: string[];
  education: Array<{
    institution: string;
    degree: string | null;
    field: string | null;
    endDate: string | null;
  }>;
  certifications: Array<{ name: string; issuer: string | null }>;
};

export type ResumePreviewBullet = {
  id: string;
  text: string;
  unsupportedClaims: string[];
};

export type ResumePreview = {
  summary: string | null;
  experiences: Array<{
    id: string;
    heading: string;
    meta: string;
    bullets: ResumePreviewBullet[];
  }>;
  projects: Array<{ id: string; name: string; description: string | null; skills: string[] }>;
  skills: string[];
  education: Array<{ id: string; line: string }>;
  certifications: Array<{ id: string; line: string }>;
};

export type ProfileSnapshot = {
  displayName: string | null;
  location: string | null;
  summary: string | null;
  yearsExperience: number | null;
  targetTitles: string[];
  skills: { id: string; name: string }[];
  experiences: Array<{
    id: string;
    company: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
    description: string | null;
    bullets: Array<{ id: string; text: string; skills: string[]; impact: string | null }>;
  }>;
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    skills: string[];
    evidence: string | null;
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string | null;
    field: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  certifications: Array<{ id: string; name: string; issuer: string | null }>;
};

export type JobTailoringContext = {
  title: string;
  companyName: string | null;
  description: string;
  technologies: string[];
  responsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  frontendFitScore: number | null;
  frontendFitReasons: string[];
  requirements: Array<{
    text: string;
    normalizedSkill: string | null;
    importance: string | null;
  }>;
  requirementMatches: Array<{
    requirementText: string;
    normalizedSkill: string | null;
    importance: string | null;
    matchStatus: string;
    confidence: number | null;
    evidenceText: string | null;
  }>;
};

export type StoredTailoredResume = {
  draft: TailoredResumeDraft;
  resolved: ResolvedResume;
};

export type TextBlock = {
  text: string;
  kind: "name" | "contact" | "section" | "role" | "meta" | "body" | "bullet";
};
