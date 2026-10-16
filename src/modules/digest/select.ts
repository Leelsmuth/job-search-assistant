import {
  classifyLocationEligibility,
  isLocationClass,
  isLocationVisible,
  LOCATION_CLASS_LABELS,
  type LocationClass,
  type LocationVisibility,
} from "@/modules/location/eligibility";
import {
  scoreFrontendFit,
  type FrontendFitProfile,
} from "@/modules/matching/frontend-fit";
import { nonEngineeringReason } from "@/modules/matching/fit-score";
import { isStaleApplied, safeHttpUrl } from "@/modules/applications/tracker";
import {
  DIGEST_JOB_LIMIT,
  type DigestFollowUp,
  type DigestJobSource,
  type DigestMatch,
  type DigestReminderSource,
  type DigestSkipReason,
  type DigestStaleApplied,
} from "@/modules/digest/types";
import {
  followUpCalendarDate,
  isFollowUpDueInToronto,
  torontoCalendarDate,
} from "@/modules/digest/time";

export {
  formatTorontoDateTime,
  isFollowUpDueInToronto,
  resolveDigestWindow,
  torontoCalendarDate,
  wasDigestSentToday,
} from "@/modules/digest/time";

function locationLabel(location: string | null, locationClass: LocationClass): string {
  const label = LOCATION_CLASS_LABELS[locationClass];
  const place = location?.trim();
  if (place) return `${place} · ${label}`;
  return label;
}

function resolvedClass(
  job: DigestJobSource,
  gtaCities: string[]
): LocationClass {
  if (isLocationClass(job.locationEligibility)) return job.locationEligibility;
  return classifyLocationEligibility(
    {
      location: job.location,
      workplaceType: job.workplaceType,
      description: job.description,
    },
    { gtaCities }
  ).class;
}

export function selectDigestJobs(input: {
  jobs: DigestJobSource[];
  visibility: LocationVisibility;
  gtaCities: string[];
  profile: FrontendFitProfile;
  limit?: number;
  /** Jobs below this score stay stored and out of the digest. */
  minScore?: number;
}): DigestMatch[] {
  const limit = input.limit ?? DIGEST_JOB_LIMIT;
  const ranked: Array<DigestMatch & { discoveredAt: number }> = [];

  for (const job of input.jobs) {
    if (job.status === "dismissed") continue;
    if (job.fitEligible === false || nonEngineeringReason(job.title)) continue;
    if (Number.isNaN(job.dateDiscovered.getTime())) continue;
    const locationClass = resolvedClass(job, input.gtaCities);
    if (!isLocationVisible(locationClass, input.visibility)) continue;

    const storedScore = job.fitScore ?? null;
    const useStored = storedScore != null && Number.isFinite(storedScore);
    const fit = useStored
      ? null
      : scoreFrontendFit(
          {
            title: job.title,
            description: job.description,
            technologies: job.technologies,
            requirements: job.requirements,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            salaryCurrency: job.salaryCurrency,
          },
          input.profile
        );
    const score = useStored ? storedScore : fit!.score;
    if (input.minScore != null && score < input.minScore) continue;
    const reason = (useStored ? job.frontendFitReasons?.[0] : fit!.reasons[0]) ?? null;

    ranked.push({
      id: job.id,
      title: job.title,
      companyName: job.companyName,
      locationLabel: locationLabel(job.location, locationClass),
      score: Math.round(score),
      resumeScore: job.resumeScore ?? null,
      reason,
      href: `/jobs/${job.id}`,
      postingUrl: safeHttpUrl(job.jobUrl),
      discoveredAt: job.dateDiscovered.getTime(),
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const resumeA = a.resumeScore ?? -1;
    const resumeB = b.resumeScore ?? -1;
    if (resumeB !== resumeA) return resumeB - resumeA;
    if (b.discoveredAt !== a.discoveredAt) return b.discoveredAt - a.discoveredAt;
    return a.title.localeCompare(b.title, "en");
  });

  return ranked.slice(0, limit).map((job) => ({
    id: job.id,
    title: job.title,
    companyName: job.companyName,
    locationLabel: job.locationLabel,
    score: job.score,
    resumeScore: job.resumeScore,
    reason: job.reason,
    href: job.href,
    postingUrl: job.postingUrl,
  }));
}

export function selectDigestReminders(
  rows: DigestReminderSource[],
  now: Date
): { followUps: DigestFollowUp[]; staleApplied: DigestStaleApplied[] } {
  const today = torontoCalendarDate(now);
  const followUps: DigestFollowUp[] = [];
  const staleApplied: DigestStaleApplied[] = [];

  for (const row of rows) {
    if (isFollowUpDueInToronto(row.followUpDate, now) && row.followUpDate) {
      const followUpDate = followUpCalendarDate(row.followUpDate);
      followUps.push({
        id: row.id,
        jobId: row.jobId,
        title: row.title,
        companyName: row.companyName,
        followUpDate,
        overdue: followUpDate < today,
        href: `/applications/${row.id}`,
      });
    }

    if (
      isStaleApplied({
        status: row.status,
        dateApplied: row.dateApplied,
        lastActivityAt: row.lastActivityAt,
        now,
      }) &&
      row.dateApplied
    ) {
      const quietMs = now.getTime() - row.lastActivityAt.getTime();
      staleApplied.push({
        id: row.id,
        jobId: row.jobId,
        title: row.title,
        companyName: row.companyName,
        dateApplied: row.dateApplied.toISOString(),
        daysQuiet: Math.max(14, Math.floor(quietMs / (24 * 60 * 60 * 1000))),
        href: `/applications/${row.id}`,
      });
    }
  }

  followUps.sort((a, b) => a.followUpDate.localeCompare(b.followUpDate) || a.title.localeCompare(b.title));
  staleApplied.sort((a, b) => b.daysQuiet - a.daysQuiet || a.title.localeCompare(b.title));
  return { followUps, staleApplied };
}

export function digestHasContent(input: {
  jobs: DigestMatch[];
  followUps: DigestFollowUp[];
  staleApplied: DigestStaleApplied[];
}): boolean {
  return input.jobs.length > 0 || input.followUps.length > 0 || input.staleApplied.length > 0;
}

export function digestSubject(input: {
  jobs: number;
  reminders: number;
}): string {
  if (input.jobs > 0 && input.reminders > 0) {
    return `Morning digest: ${countLabel(input.jobs, "new match", "new matches")}, ${countLabel(input.reminders, "reminder", "reminders")}`;
  }
  if (input.jobs > 0) return `Morning digest: ${countLabel(input.jobs, "new match", "new matches")}`;
  return `Morning digest: ${countLabel(input.reminders, "tracker reminder", "tracker reminders")}`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function isResendConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.DIGEST_FROM_EMAIL?.trim());
}

export function decideDigestDelivery(input: {
  emailsEnabled: boolean;
  alreadySentToday: boolean;
  resendConfigured: boolean;
}): { send: true } | { send: false; reason: DigestSkipReason } {
  if (!input.emailsEnabled) return { send: false, reason: "emails_disabled" };
  if (input.alreadySentToday) return { send: false, reason: "already_sent_today" };
  if (!input.resendConfigured) return { send: false, reason: "resend_not_configured" };
  return { send: true };
}

export function digestAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [
    env.NEXT_PUBLIC_APP_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
    env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      continue;
    }
  }
  return "http://localhost:3000";
}
