export const DIGEST_TIME_ZONE = "America/Toronto";
export const DIGEST_JOB_LIMIT = 10;
export const FIRST_DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export const DIGEST_SKIP_REASONS = [
  "emails_disabled",
  "already_sent_today",
  "resend_not_configured",
  "missing_recipient",
  "send_failed",
] as const;

export type DigestSkipReason = (typeof DIGEST_SKIP_REASONS)[number];

export type DigestMatch = {
  id: string;
  title: string;
  companyName: string;
  locationLabel: string;
  score: number;
  reason: string | null;
  href: string;
  postingUrl: string | null;
};

export type DigestFollowUp = {
  id: string;
  jobId: string;
  title: string;
  companyName: string;
  followUpDate: string;
  overdue: boolean;
  href: string;
};

export type DigestStaleApplied = {
  id: string;
  jobId: string;
  title: string;
  companyName: string;
  dateApplied: string;
  daysQuiet: number;
  href: string;
};

export type DigestPayload = {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  jobs: DigestMatch[];
  followUps: DigestFollowUp[];
  staleApplied: DigestStaleApplied[];
};

export type DigestPageState = {
  schemaReady: boolean;
  emailsEnabled: boolean;
  lastSentAt: string | null;
  digest: {
    generatedAt: string;
    emailedAt: string | null;
    skipReason: DigestSkipReason | null;
    subject: string;
    payload: DigestPayload;
  } | null;
};

export type DigestJobSource = {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  workplaceType: string | null;
  description?: string | null;
  technologies?: string[] | null;
  requirements?: Array<{ text?: string | null; normalizedSkill?: string | null }>;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  jobUrl: string | null;
  dateDiscovered: Date;
  status: string | null;
  locationEligibility: string | null;
  frontendFitScore: number | null;
  frontendFitReasons: string[] | null;
};

export type DigestReminderSource = {
  id: string;
  jobId: string;
  status: string;
  title: string;
  companyName: string;
  dateApplied: Date | null;
  followUpDate: Date | null;
  lastActivityAt: Date;
};
