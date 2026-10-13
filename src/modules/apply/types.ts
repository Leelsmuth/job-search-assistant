export const APPLY_PROVIDERS = ["greenhouse", "lever", "ashby", "workday", "unknown"] as const;

export type ApplyProvider = (typeof APPLY_PROVIDERS)[number];

export const FORM_QUESTION_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "boolean",
  "select",
  "multi_select",
  "date",
  "file",
  "number",
] as const;

export type FormQuestionType = (typeof FORM_QUESTION_TYPES)[number];

export type FormQuestion = {
  id: string;
  label: string;
  type: FormQuestionType;
  required: boolean;
  options?: string[];
  atsField?: string;
};

export type AnswerKind =
  | "profile"
  | "saved"
  | "open_ended"
  | "file"
  | "unmapped"
  | "cover_letter";

export type ValueSource =
  | "profile"
  | "saved"
  | "draft"
  | "edited"
  | "cover_letter"
  | "empty";

export type ApplyTarget = {
  provider: ApplyProvider;
  boardSlug: string | null;
  sourceJobId: string | null;
  jobUrl: string | null;
};

export type FetchedApplicationForm = {
  provider: ApplyProvider;
  questions: FormQuestion[];
  source: "api" | "standard";
  applyUrl: string | null;
  note: string | null;
  error: string | null;
};

export type SavedAnswerInput = {
  id: string;
  question: string;
  answer: string;
};

export type ApplicationProfile = {
  legalName: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  workAuthorization: string;
  requiresSponsorship: boolean;
  willingToRelocate: boolean;
  earliestStartDate: string;
  salaryExpectationCad: number | null;
  pronouns: string;
  howDidYouHear: string;
  eeoGender: string;
  eeoRace: string;
  eeoVeteran: string;
  eeoDisability: string;
  savedAnswers: SavedAnswerInput[];
};

export type ExistingAnswer = {
  question: string;
  draftAnswer: string | null;
  finalAnswer: string | null;
  evidenceIds: string[];
  unsupportedClaims: string[];
};

export type MappedQuestion = {
  questionId: string;
  label: string;
  type: FormQuestionType;
  required: boolean;
  options?: string[];
  atsField?: string;
  kind: AnswerKind;
  valueSource: ValueSource;
  answer: string;
  evidenceIds: string[];
  unsupportedClaims: string[];
  needsDraft: boolean;
  note: string | null;
};

export type PreparedAnswer = MappedQuestion;

export type PreparedApplication = {
  jobId: string;
  jobTitle: string;
  companyName: string;
  provider: ApplyProvider;
  formSource: "api" | "standard";
  formNote: string | null;
  fetchedAt: string | null;
  applyUrl: string | null;
  profileReady: boolean;
  answers: PreparedAnswer[];
  resume: { id: string; name: string } | null;
  coverLetter: { id: string; body: string } | null;
  applicationStatus: string | null;
  alreadyApplied: boolean;
};
