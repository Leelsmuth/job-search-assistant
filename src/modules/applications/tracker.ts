import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/utils";

export const TRACKER_STAGES = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type TrackerStage = (typeof TRACKER_STAGES)[number];

export const STALE_APPLIED_MS = 14 * 24 * 60 * 60 * 1000;

const SAVED_STATUSES = new Set<string>([
  "saved",
  "discovered",
  "reviewing",
  "preparing",
  "ready_to_apply",
]);

const INTERVIEW_STATUSES = new Set<string>([
  "interviewing",
  "recruiter_screen",
  "technical_interview",
  "final_interview",
]);

const STATUS_LABELS: Record<string, string> = {
  discovered: "Discovered",
  reviewing: "Reviewing",
  saved: "Saved",
  preparing: "Preparing",
  ready_to_apply: "Ready to apply",
  applied: "Applied",
  interviewing: "Interviewing",
  recruiter_screen: "Recruiter screen",
  technical_interview: "Technical interview",
  final_interview: "Final interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const WORKPLACE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  on_site: "On-site",
};

export type TrackerSort = "applied" | "activity";
export type SortDirection = "asc" | "desc";

export type TrackerQuery = {
  view: "list" | "board";
  status: TrackerStage | "all";
  sort: TrackerSort;
  dir: SortDirection;
};

export type AttentionFlag = "follow_up_due" | "stale_applied";

export function attentionLabel(flag: AttentionFlag): string {
  if (flag === "follow_up_due") return "Follow-up due";
  return "No activity for 14 days";
}

const DISPLAY_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const DISPLAY_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DISPLAY_DATE.format(date);
}

export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DISPLAY_DATE_TIME.format(date);
}

export type TrackedApplication = {
  id: string;
  jobId: string;
  status: string;
  stage: TrackerStage;
  notes: string | null;
  dateApplied: string | null;
  followUpDate: string | null;
  lastActivityAt: string;
  companyName: string;
  title: string;
  jobUrl: string | null;
  location: string | null;
  workplaceType: string | null;
  locationLabel: string;
  attention: AttentionFlag[];
};

export type TrackedEvent = {
  id: string;
  eventType: string;
  eventDate: string | null;
  createdAt: string;
  notes: string | null;
  payload: unknown;
};

export type TrackedApplicationDetail = TrackedApplication & {
  events: TrackedEvent[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function isTrackerStage(value: string | undefined): value is TrackerStage {
  return TRACKER_STAGES.some((stage) => stage === value);
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function pipelineStage(status: string): TrackerStage {
  if (INTERVIEW_STATUSES.has(status)) return "interviewing";
  if (status === "applied" || status === "offer" || status === "rejected" || status === "withdrawn") {
    return status;
  }
  if (SAVED_STATUSES.has(status)) return "saved";
  return "saved";
}

export function statusOptions(current: string): string[] {
  const options: string[] = [...TRACKER_STAGES];
  if (!options.includes(current)) options.push(current);
  return options;
}

export function formatWorkplace(workplaceType: string | null | undefined): string | null {
  if (!workplaceType || workplaceType === "unknown") return null;
  return WORKPLACE_LABELS[workplaceType] ?? workplaceType;
}

export function formatWorkLocation(
  location: string | null | undefined,
  workplaceType: string | null | undefined
): string {
  const place = location?.trim() || null;
  const workplace = formatWorkplace(workplaceType);
  if (place && workplace) return `${place} · ${workplace}`;
  return place || workplace || "Location not set";
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseCalendarDate(value: string, label: string): Date {
  const trimmed = value.trim();
  if (!CALENDAR_DATE.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  const date = new Date(`${trimmed}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return date;
}

export function formatCalendarDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function utcDayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function isFollowUpDue(followUpDate: Date | null, now: Date): boolean {
  if (!followUpDate || Number.isNaN(followUpDate.getTime())) return false;
  return utcDayStart(followUpDate) <= utcDayStart(now);
}

export function isStaleApplied(input: {
  status: string;
  dateApplied: Date | null;
  lastActivityAt: Date | null;
  now: Date;
}): boolean {
  if (input.status !== "applied" || !input.dateApplied) return false;
  const appliedAt = input.dateApplied.getTime();
  if (Number.isNaN(appliedAt)) return false;
  const activityAt = input.lastActivityAt?.getTime();
  const latest =
    activityAt != null && !Number.isNaN(activityAt) ? Math.max(appliedAt, activityAt) : appliedAt;
  return input.now.getTime() - latest >= STALE_APPLIED_MS;
}

export function attentionFor(input: {
  status: string;
  dateApplied: Date | null;
  followUpDate: Date | null;
  lastActivityAt: Date | null;
  now: Date;
}): AttentionFlag[] {
  const flags: AttentionFlag[] = [];
  if (isFollowUpDue(input.followUpDate, input.now)) flags.push("follow_up_due");
  if (isStaleApplied(input)) flags.push("stale_applied");
  return flags;
}

export function latestActivityAt(
  updatedAt: Date,
  events: Array<{ createdAt: Date | null; eventDate: Date | null }>
): Date {
  let latest = updatedAt.getTime();
  for (const event of events) {
    const created = event.createdAt?.getTime();
    const dated = event.eventDate?.getTime();
    if (created != null && !Number.isNaN(created)) latest = Math.max(latest, created);
    if (dated != null && !Number.isNaN(dated)) latest = Math.max(latest, dated);
  }
  return new Date(latest);
}

export function parseTrackerQuery(input: {
  view?: string;
  status?: string;
  sort?: string;
  dir?: string;
}): TrackerQuery {
  return {
    view: input.view === "board" || input.view === "kanban" ? "board" : "list",
    status: isTrackerStage(input.status) ? input.status : "all",
    sort: input.sort === "applied" ? "applied" : "activity",
    dir: input.dir === "asc" ? "asc" : "desc",
  };
}

export function trackerHref(query: TrackerQuery, patch: Partial<TrackerQuery> = {}): string {
  const next: TrackerQuery = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.view === "board") params.set("view", "board");
  if (next.status !== "all") params.set("status", next.status);
  if (next.sort !== "activity") params.set("sort", next.sort);
  if (next.dir !== "desc") params.set("dir", next.dir);
  const search = params.toString();
  return search ? `/applications?${search}` : "/applications";
}

type SortableApplication = {
  stage: TrackerStage;
  dateApplied: string | null;
  lastActivityAt: string;
  companyName: string;
  title: string;
};

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

export function compareTracked(
  a: SortableApplication,
  b: SortableApplication,
  sort: TrackerSort,
  dir: SortDirection
): number {
  const aValue = sort === "applied" ? a.dateApplied : a.lastActivityAt;
  const bValue = sort === "applied" ? b.dateApplied : b.lastActivityAt;
  if (!aValue && !bValue) {
    return compareText(a.companyName, b.companyName) || compareText(a.title, b.title);
  }
  if (!aValue) return 1;
  if (!bValue) return -1;
  const delta = new Date(aValue).getTime() - new Date(bValue).getTime();
  if (delta !== 0) return dir === "asc" ? delta : -delta;
  return compareText(a.companyName, b.companyName) || compareText(a.title, b.title);
}

export function selectApplications<T extends SortableApplication>(
  rows: T[],
  query: Pick<TrackerQuery, "status" | "sort" | "dir">
): T[] {
  const filtered = query.status === "all" ? rows.slice() : rows.filter((row) => row.stage === query.status);
  filtered.sort((a, b) => compareTracked(a, b, query.sort, query.dir));
  return filtered;
}

export function stageCounts(rows: Array<{ stage: TrackerStage }>): Record<TrackerStage | "all", number> {
  const counts: Record<TrackerStage | "all", number> = {
    all: rows.length,
    saved: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const row of rows) counts[row.stage] += 1;
  return counts;
}

export type ManualApplicationInput = {
  company: string;
  title: string;
  jobUrl: string;
  location: string | null;
  workplaceType: "remote" | "hybrid" | "on_site" | null;
  status: TrackerStage;
  dateApplied: Date | null;
  followUpDate: Date | null;
  notes: string | null;
};

const MAX_COMPANY = 160;
const MAX_TITLE = 200;
const MAX_LOCATION = 200;
const MAX_NOTES = 8000;

function readString(form: Record<string, unknown>, key: string): string {
  const value = form[key];
  return typeof value === "string" ? value.trim() : "";
}

export function parseManualApplication(input: unknown): ManualApplicationInput {
  if (!input || typeof input !== "object") {
    throw new Error("Enter the company, role, and job URL");
  }
  const form = input as Record<string, unknown>;
  const company = readString(form, "company").replace(/\s+/g, " ");
  const title = readString(form, "title").replace(/\s+/g, " ");
  const jobUrlRaw = readString(form, "jobUrl");
  const locationRaw = readString(form, "location");
  const workplaceRaw = readString(form, "workplaceType");
  const statusRaw = readString(form, "status") || "saved";
  const dateAppliedRaw = readString(form, "dateApplied");
  const followUpRaw = readString(form, "followUpDate");
  const notesRaw = readString(form, "notes");

  if (!company || company.length > MAX_COMPANY) {
    throw new Error(`Company is required and must be ${MAX_COMPANY} characters or fewer`);
  }
  if (!title || title.length > MAX_TITLE) {
    throw new Error(`Role title is required and must be ${MAX_TITLE} characters or fewer`);
  }
  const jobUrl = safeHttpUrl(jobUrlRaw);
  if (!jobUrl || jobUrl.length > 2000) {
    throw new Error("Enter a valid job URL starting with http:// or https://");
  }
  if (locationRaw.length > MAX_LOCATION) {
    throw new Error(`Location must be ${MAX_LOCATION} characters or fewer`);
  }
  if (notesRaw.length > MAX_NOTES) {
    throw new Error(`Notes must be ${MAX_NOTES} characters or fewer`);
  }
  if (!isTrackerStage(statusRaw)) {
    throw new Error("Choose a status from the pipeline");
  }
  const workplaceType =
    workplaceRaw === "remote" || workplaceRaw === "hybrid" || workplaceRaw === "on_site"
      ? workplaceRaw
      : null;

  return {
    company,
    title,
    jobUrl,
    location: locationRaw || null,
    workplaceType,
    status: statusRaw,
    dateApplied: dateAppliedRaw ? parseCalendarDate(dateAppliedRaw, "Applied date") : null,
    followUpDate: followUpRaw ? parseCalendarDate(followUpRaw, "Follow-up date") : null,
    notes: notesRaw || null,
  };
}

export function parseNotes(value: unknown): string {
  if (typeof value !== "string") throw new Error("Notes must be text");
  const notes = value.trim();
  if (notes.length > MAX_NOTES) {
    throw new Error(`Notes must be ${MAX_NOTES} characters or fewer`);
  }
  return notes;
}

export function parseOptionalCalendarField(value: unknown, label: string): Date | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be YYYY-MM-DD`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parseCalendarDate(trimmed, label);
}

export function describeEvent(event: {
  eventType: string;
  notes: string | null;
  payload: unknown;
}): { title: string; detail: string | null } {
  const payload = isRecord(event.payload) ? event.payload : null;
  const kind = typeof payload?.kind === "string" ? payload.kind : null;

  if (kind === "status_change") {
    const fromStatus = typeof payload?.fromStatus === "string" ? payload.fromStatus : "unknown";
    const toStatus = typeof payload?.toStatus === "string" ? payload.toStatus : "unknown";
    return {
      title: `Status changed from ${statusLabel(fromStatus)} to ${statusLabel(toStatus)}`,
      detail: event.notes,
    };
  }

  if (kind === "assisted_apply" || event.eventType === "marked_applied") {
    const provider = typeof payload?.provider === "string" ? payload.provider : null;
    return {
      title: provider ? `Marked as applied · ${provider}` : "Marked as applied",
      detail: event.notes,
    };
  }

  if (kind === "manual_add") {
    return {
      title: "Added manually",
      detail: event.notes,
    };
  }

  if (kind === "follow_up") {
    const followUpDate = typeof payload?.followUpDate === "string" ? payload.followUpDate : null;
    return {
      title: followUpDate ? `Follow-up set to ${followUpDate}` : "Follow-up cleared",
      detail: null,
    };
  }

  if (kind === "notes" || event.eventType === "notes_updated") {
    return {
      title: "Notes updated",
      detail: event.notes,
    };
  }

  if (kind === "applied_date") {
    const dateApplied = typeof payload?.dateApplied === "string" ? payload.dateApplied : null;
    return {
      title: dateApplied ? `Applied date set to ${dateApplied}` : "Applied date cleared",
      detail: null,
    };
  }

  return {
    title: statusLabel(event.eventType),
    detail: event.notes,
  };
}

export function assistedApplyAnswers(payload: unknown): Array<{ question: string; answer: string }> {
  if (!isRecord(payload) || payload.kind !== "assisted_apply" || !Array.isArray(payload.answers)) {
    return [];
  }
  return payload.answers.flatMap((answer) => {
    if (!isRecord(answer)) return [];
    const question = typeof answer.question === "string" ? answer.question : "";
    const text = typeof answer.answer === "string" ? answer.answer : "";
    if (!question && !text) return [];
    return [{ question, answer: text }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function appliedDateForStatus(status: string, explicit: Date | null, now: Date): Date | null {
  if (explicit) return explicit;
  if (status === "saved") return null;
  return now;
}
