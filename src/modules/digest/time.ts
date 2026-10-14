import { DIGEST_TIME_ZONE, FIRST_DIGEST_LOOKBACK_MS } from "@/modules/digest/types";

const TORONTO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: DIGEST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function torontoCalendarDate(date: Date): string {
  return TORONTO_DATE.format(date);
}

export function formatTorontoDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DIGEST_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Calendar date the user picked. Follow-ups are stored at 12:00 UTC on that date. */
export function followUpCalendarDate(followUpDate: Date): string {
  return followUpDate.toISOString().slice(0, 10);
}

export function isFollowUpDueInToronto(followUpDate: Date | null, now: Date): boolean {
  if (!followUpDate || Number.isNaN(followUpDate.getTime())) return false;
  return followUpCalendarDate(followUpDate) <= torontoCalendarDate(now);
}

export function wasDigestSentToday(lastSentAt: Date | null, now: Date): boolean {
  if (!lastSentAt || Number.isNaN(lastSentAt.getTime())) return false;
  return torontoCalendarDate(lastSentAt) === torontoCalendarDate(now);
}

export function resolveDigestWindow(input: {
  now: Date;
  lastGeneratedAt: Date | null;
  openDigest: { generatedAt: Date; windowStart: Date } | null;
}): { windowStart: Date; windowEnd: Date } {
  const today = torontoCalendarDate(input.now);
  if (input.openDigest && torontoCalendarDate(input.openDigest.generatedAt) === today) {
    return { windowStart: input.openDigest.windowStart, windowEnd: input.now };
  }
  const start = input.lastGeneratedAt ?? new Date(input.now.getTime() - FIRST_DIGEST_LOOKBACK_MS);
  return { windowStart: start, windowEnd: input.now };
}
