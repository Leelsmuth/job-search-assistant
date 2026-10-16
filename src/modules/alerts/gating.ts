import { DIGEST_TIME_ZONE } from "@/modules/digest/types";

export const DEFAULT_ALERT_DAILY_CAP = 10;
export const DEFAULT_QUIET_START_MINUTE = 22 * 60;
export const DEFAULT_QUIET_END_MINUTE = 7 * 60;
export const ALERT_FRESH_MS = 24 * 60 * 60 * 1000;

export type AlertCandidate = {
  jobId: string;
  fitScore: number | null;
  fitEligible: boolean;
  postedAt: Date | null;
};

export type AlertPlan = {
  sendJobIds: string[];
  queue: Array<{ jobId: string; queuedUntil: Date }>;
};

export function torontoMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DIGEST_TIME_ZONE,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Quiet hours wrap midnight. Defaults are 10:00 PM–7:00 AM America/Toronto. */
export function isQuietHours(
  now: Date,
  startMinute = DEFAULT_QUIET_START_MINUTE,
  endMinute = DEFAULT_QUIET_END_MINUTE
): boolean {
  const minutes = torontoMinutes(now);
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) return minutes >= startMinute && minutes < endMinute;
  return minutes >= startMinute || minutes < endMinute;
}

export function nextQuietEnd(
  now: Date,
  startMinute = DEFAULT_QUIET_START_MINUTE,
  endMinute = DEFAULT_QUIET_END_MINUTE
): Date {
  if (!isQuietHours(now, startMinute, endMinute)) return now;
  for (let step = 1; step <= 24 * 60; step += 1) {
    const candidate = new Date(now.getTime() + step * 60_000);
    if (!isQuietHours(candidate, startMinute, endMinute)) return candidate;
  }
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function eligible(
  job: AlertCandidate,
  now: Date,
  minFit: number,
  alreadyAlerted: ReadonlySet<string>
): boolean {
  if (alreadyAlerted.has(job.jobId)) return false;
  if (!job.fitEligible) return false;
  if (job.fitScore == null || !Number.isFinite(job.fitScore) || job.fitScore < minFit) return false;
  if (!job.postedAt || Number.isNaN(job.postedAt.getTime())) return false;
  const age = now.getTime() - job.postedAt.getTime();
  return age >= 0 && age < ALERT_FRESH_MS;
}

/**
 * Choose which fresh, eligible, high-fit jobs to email or queue.
 * The daily cap and dedupe apply before anything is sent. Quiet hours queue
 * until the window ends instead of sending. Ranking bonuses are not consulted.
 */
export function planInstantAlerts(input: {
  now: Date;
  enabled: boolean;
  minFit: number;
  dailyCap: number;
  sentToday: number;
  alreadyAlertedJobIds: ReadonlySet<string>;
  quietStartMinute?: number;
  quietEndMinute?: number;
  candidates: readonly AlertCandidate[];
}): AlertPlan {
  if (!input.enabled) return { sendJobIds: [], queue: [] };
  const start = input.quietStartMinute ?? DEFAULT_QUIET_START_MINUTE;
  const end = input.quietEndMinute ?? DEFAULT_QUIET_END_MINUTE;
  const quiet = isQuietHours(input.now, start, end);
  const queuedUntil = quiet ? nextQuietEnd(input.now, start, end) : input.now;
  const room = Math.max(0, input.dailyCap - input.sentToday);
  const sendJobIds: string[] = [];
  const queue: AlertPlan["queue"] = [];
  const seen = new Set<string>();

  for (const job of input.candidates) {
    if (seen.has(job.jobId)) continue;
    seen.add(job.jobId);
    if (!eligible(job, input.now, input.minFit, input.alreadyAlertedJobIds)) continue;
    if (quiet) {
      queue.push({ jobId: job.jobId, queuedUntil });
      continue;
    }
    if (sendJobIds.length >= room) continue;
    sendJobIds.push(job.jobId);
  }

  return { sendJobIds, queue };
}
