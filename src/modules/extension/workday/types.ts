import type { ApplicationProfile } from "@/modules/apply/types";

export const WORKDAY_STEP_IDS = [
  "signIn",
  "createAccount",
  "myInformation",
  "myExperience",
  "applicationQuestions",
  "voluntaryDisclosures",
  "selfIdentify",
  "review",
  "unknown",
] as const;

export type WorkdayStepId = (typeof WORKDAY_STEP_IDS)[number];

export type DetectedWorkdayStep = {
  id: WorkdayStepId;
  title: string;
};

export type WorkdayExperience = {
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
};

export type WorkdayEducation = {
  school: string;
  degree: string;
  field: string;
  location: string;
  startDate: string;
  endDate: string;
};

export type WorkdayHistory = {
  experiences: WorkdayExperience[];
  education: WorkdayEducation[];
  skills: string[];
};

export type WorkdayPreparedAnswer = {
  label: string;
  answer: string;
};

export type WorkdayResumeFile = {
  filename: string;
  bytes: number[];
};

export type WorkdayFillInput = {
  profile: ApplicationProfile;
  preparedAnswers: WorkdayPreparedAnswer[];
  history: WorkdayHistory;
  coverLetterBody?: string | null;
  resume?: WorkdayResumeFile | null;
};

export type WorkdayFillResult = {
  step: DetectedWorkdayStep;
  blocked: boolean;
  message: string;
  filled: Array<{ label: string; value: string }>;
  skipped: string[];
  attention: Array<{ label: string; reason: string }>;
  experienceAdded: number;
  educationAdded: number;
  skillsAdded: string[];
  controlCount: number;
};

export type WorkdayFilledStep = {
  at: number;
  controlCount: number;
  experienceAdded: number;
  educationAdded: number;
  skills: string[];
};

export type WorkdaySession = {
  requisitionKey: string;
  filled: Partial<Record<WorkdayStepId, WorkdayFilledStep>>;
};

export const WORKDAY_REVIEW_MESSAGE = "Review step. The extension will not submit.";

export const WORKDAY_AUTH_MESSAGE =
  "Sign in yourself. The extension does not enter passwords or create accounts.";

const STEP_TITLES: Record<WorkdayStepId, string> = {
  signIn: "Sign in",
  createAccount: "Create account",
  myInformation: "My Information",
  myExperience: "My Experience",
  applicationQuestions: "Application Questions",
  voluntaryDisclosures: "Voluntary Disclosures",
  selfIdentify: "Self Identify",
  review: "Review",
  unknown: "This step",
};

export function workdayStepTitle(id: WorkdayStepId, detected?: string): string {
  const title = detected?.trim();
  if (title && title.length <= 80) return title;
  return STEP_TITLES[id];
}

export function workdayStatusMessage(stepTitle: string, needsYou: number): string {
  const noun = needsYou === 1 ? "field needs" : "fields need";
  return `${stepTitle} filled, ${needsYou} ${noun} you`;
}

export function emptyWorkdayHistory(): WorkdayHistory {
  return { experiences: [], education: [], skills: [] };
}

export function isQuestionStep(id: WorkdayStepId): boolean {
  return id === "applicationQuestions" || id === "voluntaryDisclosures" || id === "selfIdentify";
}
