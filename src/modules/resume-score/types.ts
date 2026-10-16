export const RESUME_SCORE_WEIGHTS = {
  hardSkills: 0.35,
  keywords: 0.25,
  seniority: 0.15,
  experienceYears: 0.15,
  atsFormat: 0.1,
} as const;

export const RESUME_SUGGESTION_PROMPT = "resume.ats_suggestions.v1";

export type ResumeScoreSource = "parsed" | "tailored";

export type SeniorityLevel = "intern" | "junior" | "mid" | "senior" | "lead" | "staff" | "principal";

export type KeywordImportance = "required" | "preferred";

export type KeywordKind = "skill" | "qualification";

export type ExtractedKeyword = {
  term: string;
  importance: KeywordImportance;
  kind: KeywordKind;
};

export type ExtractedJobRequirements = {
  requiredSkills: string[];
  preferredSkills: string[];
  keywords: ExtractedKeyword[];
  seniority: SeniorityLevel | null;
  yearsRequired: number | null;
  mustHaveQualifications: string[];
};

export type ResumeScoreJob = {
  title: string;
  description?: string | null;
  technologies?: string[] | null;
  requiredQualifications?: string[] | null;
  preferredQualifications?: string[] | null;
  requirements?: Array<{
    text?: string | null;
    normalizedSkill?: string | null;
    importance?: string | null;
  }>;
};

export type EvidenceCitation = {
  id: string | null;
  sourceType: string;
  text: string;
};

export type ResumeScoreEvidence = {
  id: string;
  sourceType: string;
  text: string;
  normalizedSkills?: string[] | null;
};

export type ResumeScoreProfile = {
  skills?: string[] | null;
  yearsExperience?: number | null;
  titles?: string[] | null;
  evidence?: ResumeScoreEvidence[] | null;
};

export type ResumeScoreDocument = {
  text: string;
  fileType?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  /** True for the single-column PDF and DOCX this app exports. */
  exportedByApp?: boolean;
  usesTables?: boolean;
  usesColumns?: boolean;
};

export type AtsCheckId = "headings" | "contact" | "tables" | "columns" | "dates" | "fileType";

export type AtsCheck = {
  id: AtsCheckId;
  label: string;
  passed: boolean;
  detail: string;
};

export type ResumeSubscores = {
  hardSkills: number;
  keywords: number;
  seniority: number;
  experienceYears: number;
  atsFormat: number;
};

export type MissingKeyword = {
  term: string;
  importance: KeywordImportance;
  kind: KeywordKind;
  evidence: EvidenceCitation | null;
};

export type ResumeScoreResult = {
  overall: number;
  subscores: ResumeSubscores;
  reasons: Record<keyof ResumeSubscores, string>;
  checks: AtsCheck[];
  extracted: ExtractedJobRequirements;
  present: string[];
  add: MissingKeyword[];
  gaps: MissingKeyword[];
};

export type ResumeSuggestion = {
  bulletId: string;
  originalText: string;
  suggestedText: string;
  keywords: string[];
  evidence: EvidenceCitation[];
};

export type RawResumeSuggestion = {
  bulletId: string;
  originalText: string;
  suggestedText: string;
  keywords: string[];
  evidenceIds: string[];
};

export type ResumeMatchView = {
  source: ResumeScoreSource;
  sourceLabel: string;
  resumeHash: string;
  jobHash: string;
  hasParsed: boolean;
  hasTailored: boolean;
  schemaReady: boolean;
  aiAvailable: boolean;
  model: string;
  score: ResumeScoreResult;
  beforeScore: number | null;
  afterScore: number | null;
  suggestions: ResumeSuggestion[];
  suggestionsCached: boolean;
};

export type StoredResumeSuggestion = ResumeSuggestion;
