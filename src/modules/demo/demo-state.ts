/**
 * State for the public demo. Pure functions only: the browser store persists the
 * result in localStorage, and nothing here touches Supabase or Postgres.
 *
 * Transitions mirror the signed-in app (src/server/actions, modules/applications/store):
 * - Saving a job creates a "saved" application if the job has none.
 * - Unsaving a job clears the saved flag but keeps its application.
 * - Moving to "applied" stamps the applied date the first time.
 *
 * Applications can also be imported from a spreadsheet (see demo-import.ts).
 * Those carry their own job details, since there is no sample job behind them.
 */
import type { ApplicationStatus } from "@/lib/utils";
import {
  attentionFor,
  formatCalendarDate,
  formatWorkLocation,
  isApplicationStatus,
  parseNotes,
  parseOptionalCalendarField,
  pipelineStage,
  safeHttpUrl,
  type TrackedApplication,
} from "@/modules/applications/tracker";
import { DEMO_JOBS, getDemoJob, isDemoJobId, type DemoJob } from "@/modules/demo/sample-jobs";

export const DEMO_STATE_VERSION = 1;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The job behind an application imported from a spreadsheet. Sample-job
 * applications have no copy: their company, title, and location come from
 * DEMO_JOBS. Imported ones carry what the visitor's file said.
 */
export type DemoImportedJob = {
  company: string;
  title: string;
  location: string | null;
  workplaceType: "remote" | "hybrid" | "on_site" | null;
  jobUrl: string | null;
};

export type DemoApplication = {
  id: string;
  /** A sample job id, or an `import-<n>` id for imported applications. */
  jobId: string;
  status: ApplicationStatus;
  notes: string | null;
  dateSaved: string;
  dateApplied: string | null;
  followUpDate: string | null;
  updatedAt: string;
  /** Set exactly when the application was imported and is not a sample job. */
  job?: DemoImportedJob;
};

export type DemoState = {
  version: typeof DEMO_STATE_VERSION;
  seededAt: string;
  savedJobIds: string[];
  dismissedJobIds: string[];
  applications: DemoApplication[];
};

export function demoApplicationId(jobId: string): string {
  return `demo-app-${jobId}`;
}

const IMPORTED_JOB_ID = /^import-[1-9]\d*$/;

/** Job id for the nth imported application. Never collides with a sample job id. */
export function demoImportedJobId(sequence: number): string {
  return `import-${sequence}`;
}

export function isDemoImportedJobId(jobId: string): boolean {
  return IMPORTED_JOB_ID.test(jobId);
}

/** UTC noon, the same convention the tracker uses for calendar dates. */
function calendarNoon(date: Date): string {
  return `${formatCalendarDate(date)}T12:00:00.000Z`;
}

/**
 * Fresh demo data. Two roles are already in the pipeline so the tracker is not
 * empty: one applied long enough ago to be flagged stale, and one interview with
 * a follow-up due today.
 */
export function createDemoState(now: Date = new Date()): DemoState {
  const seededAt = now.toISOString();
  const appliedAt = new Date(now.getTime() - 16 * DAY_MS);
  const interviewSavedAt = new Date(now.getTime() - 11 * DAY_MS);
  const interviewAppliedAt = new Date(now.getTime() - 10 * DAY_MS);
  const interviewUpdatedAt = new Date(now.getTime() - 3 * DAY_MS);

  return {
    version: DEMO_STATE_VERSION,
    seededAt,
    savedJobIds: ["harbourline-fullstack", "civic-form-accessibility"],
    dismissedJobIds: [],
    applications: [
      {
        id: demoApplicationId("harbourline-fullstack"),
        jobId: "harbourline-fullstack",
        status: "applied",
        notes: "Applied through the careers page with the full-stack resume.",
        dateSaved: new Date(appliedAt.getTime() - DAY_MS).toISOString(),
        dateApplied: appliedAt.toISOString(),
        followUpDate: null,
        updatedAt: appliedAt.toISOString(),
      },
      {
        id: demoApplicationId("civic-form-accessibility"),
        jobId: "civic-form-accessibility",
        status: "interviewing",
        notes: "Panel interview booked. Send a thank-you note afterwards.",
        dateSaved: interviewSavedAt.toISOString(),
        dateApplied: interviewAppliedAt.toISOString(),
        followUpDate: calendarNoon(now),
        updatedAt: interviewUpdatedAt.toISOString(),
      },
    ],
  };
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => jsonEqual(item, b[index]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && jsonEqual(a[key], b[key])
  );
}

/**
 * True when the visitor has not changed anything since the demo was seeded,
 * so there is nothing for Reset to undo. Seeding is deterministic for a given
 * start time, so rebuild the seed and compare.
 */
export function isDemoStatePristine(state: DemoState): boolean {
  return jsonEqual(state, createDemoState(new Date(state.seededAt)));
}

/** An untouched demo older than this is reseeded on load so sample dates look current. */
export const DEMO_REFRESH_AFTER_MS = DAY_MS;

/**
 * Reseed an untouched demo once its sample dates have gone stale. A demo the
 * visitor has changed is returned as is, so no work is ever lost; Reset is
 * available for those. Returns the same object when nothing needs to change.
 */
export function refreshStalePristineDemo(state: DemoState, now: Date = new Date()): DemoState {
  // Cheap age check first, so a typical load skips the pristine comparison.
  const age = now.getTime() - new Date(state.seededAt).getTime();
  if (!(age >= DEMO_REFRESH_AFTER_MS)) return state;
  if (!isDemoStatePristine(state)) return state;
  return createDemoState(now);
}

// ---------------------------------------------------------------------------
// Parsing persisted state
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function optionalIsoDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isIsoDate(value) ? value : undefined;
}

function knownJobIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((id): id is string => typeof id === "string" && isDemoJobId(id));
  return Array.from(new Set(ids));
}

function optionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function parseImportedJob(value: unknown): DemoImportedJob | null {
  if (!isRecord(value)) return null;
  const { company, title, workplaceType } = value;
  const location = optionalString(value.location);
  const jobUrl = optionalString(value.jobUrl);
  if (typeof company !== "string" || !company.trim()) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  if (location === undefined || jobUrl === undefined) return null;
  // Links are rendered as hrefs, so only ever keep http(s) ones.
  if (jobUrl !== null && safeHttpUrl(jobUrl) === null) return null;
  if (
    workplaceType !== null &&
    workplaceType !== "remote" &&
    workplaceType !== "hybrid" &&
    workplaceType !== "on_site"
  ) {
    return null;
  }
  return { company, title, location, workplaceType, jobUrl };
}

function parseApplication(value: unknown): DemoApplication | null {
  if (!isRecord(value)) return null;
  const { id, jobId, status, notes, dateSaved, dateApplied, followUpDate, updatedAt } = value;
  if (typeof id !== "string" || typeof jobId !== "string") return null;
  // Sample-job applications have no job copy; imported ones must have a valid one.
  let job: DemoImportedJob | undefined;
  if (isDemoJobId(jobId)) {
    if (value.job !== undefined) return null;
  } else if (isDemoImportedJobId(jobId)) {
    const parsed = parseImportedJob(value.job);
    if (!parsed) return null;
    job = parsed;
  } else {
    return null;
  }
  if (typeof status !== "string" || !isApplicationStatus(status)) return null;
  if (notes !== null && typeof notes !== "string") return null;
  if (!isIsoDate(dateSaved) || !isIsoDate(updatedAt)) return null;
  const applied = optionalIsoDate(dateApplied);
  const followUp = optionalIsoDate(followUpDate);
  if (applied === undefined || followUp === undefined) return null;
  return {
    id,
    jobId,
    status,
    notes,
    dateSaved,
    dateApplied: applied,
    followUpDate: followUp,
    updatedAt,
    ...(job ? { job } : {}),
  };
}

/**
 * Validate state read from storage. Returns null for anything unusable
 * (corrupt JSON, an older version, hand-edited values) so the caller reseeds.
 */
export function parseDemoState(value: unknown): DemoState | null {
  if (!isRecord(value) || value.version !== DEMO_STATE_VERSION) return null;
  if (!isIsoDate(value.seededAt)) return null;
  const savedJobIds = knownJobIds(value.savedJobIds);
  const dismissedJobIds = knownJobIds(value.dismissedJobIds);
  if (!savedJobIds || !dismissedJobIds || !Array.isArray(value.applications)) return null;

  const applications: DemoApplication[] = [];
  const seenJobs = new Set<string>();
  for (const raw of value.applications) {
    const application = parseApplication(raw);
    if (!application) return null;
    // One application per job, same as the real tracker.
    if (seenJobs.has(application.jobId)) continue;
    seenJobs.add(application.jobId);
    applications.push(application);
  }

  return {
    version: DEMO_STATE_VERSION,
    seededAt: value.seededAt,
    savedJobIds,
    dismissedJobIds,
    applications,
  };
}

// ---------------------------------------------------------------------------
// Job feed transitions
// ---------------------------------------------------------------------------

function requireJob(jobId: string): DemoJob {
  const job = getDemoJob(jobId);
  if (!job) throw new Error("Job not found");
  return job;
}

function without(ids: string[], id: string): string[] {
  return ids.filter((existing) => existing !== id);
}

export function saveDemoJob(state: DemoState, jobId: string, now: Date = new Date()): DemoState {
  requireJob(jobId);
  const savedJobIds = state.savedJobIds.includes(jobId)
    ? state.savedJobIds
    : [...state.savedJobIds, jobId];
  const hasApplication = state.applications.some((app) => app.jobId === jobId);
  const timestamp = now.toISOString();
  return {
    ...state,
    savedJobIds,
    // A saved job should be visible in the feed again.
    dismissedJobIds: without(state.dismissedJobIds, jobId),
    applications: hasApplication
      ? state.applications
      : [
          ...state.applications,
          {
            id: demoApplicationId(jobId),
            jobId,
            status: "saved",
            notes: null,
            dateSaved: timestamp,
            dateApplied: null,
            followUpDate: null,
            updatedAt: timestamp,
          },
        ],
  };
}

export function unsaveDemoJob(state: DemoState, jobId: string): DemoState {
  requireJob(jobId);
  return { ...state, savedJobIds: without(state.savedJobIds, jobId) };
}

export function dismissDemoJob(state: DemoState, jobId: string): DemoState {
  requireJob(jobId);
  if (state.dismissedJobIds.includes(jobId)) return state;
  return { ...state, dismissedJobIds: [...state.dismissedJobIds, jobId] };
}

export function restoreDemoJob(state: DemoState, jobId: string): DemoState {
  requireJob(jobId);
  return { ...state, dismissedJobIds: without(state.dismissedJobIds, jobId) };
}

// ---------------------------------------------------------------------------
// Tracker transitions
// ---------------------------------------------------------------------------

function updateApplication(
  state: DemoState,
  applicationId: string,
  update: (app: DemoApplication) => DemoApplication | null
): DemoState {
  const index = state.applications.findIndex((app) => app.id === applicationId);
  if (index === -1) throw new Error("Application not found");
  const next = update(state.applications[index]);
  if (!next) return state;
  const applications = state.applications.slice();
  applications[index] = next;
  return { ...state, applications };
}

export function setDemoApplicationStatus(
  state: DemoState,
  applicationId: string,
  status: string,
  now: Date = new Date()
): DemoState {
  if (!isApplicationStatus(status)) throw new Error("Unknown status");
  return updateApplication(state, applicationId, (app) => {
    if (app.status === status) return null;
    return {
      ...app,
      status,
      dateApplied:
        status === "applied" && !app.dateApplied ? now.toISOString() : app.dateApplied,
      updatedAt: now.toISOString(),
    };
  });
}

export function setDemoApplicationNotes(
  state: DemoState,
  applicationId: string,
  notes: string,
  now: Date = new Date()
): DemoState {
  const parsed = parseNotes(notes);
  return updateApplication(state, applicationId, (app) => {
    if ((app.notes ?? "") === parsed) return null;
    return { ...app, notes: parsed, updatedAt: now.toISOString() };
  });
}

export function setDemoApplicationFollowUp(
  state: DemoState,
  applicationId: string,
  followUpDate: string,
  now: Date = new Date()
): DemoState {
  const parsed = parseOptionalCalendarField(followUpDate, "Follow-up date");
  return updateApplication(state, applicationId, (app) => {
    if (formatCalendarDate(app.followUpDate) === formatCalendarDate(parsed)) return null;
    return {
      ...app,
      followUpDate: parsed ? parsed.toISOString() : null,
      updatedAt: now.toISOString(),
    };
  });
}

export function setDemoApplicationAppliedDate(
  state: DemoState,
  applicationId: string,
  dateApplied: string,
  now: Date = new Date()
): DemoState {
  const parsed = parseOptionalCalendarField(dateApplied, "Applied date");
  return updateApplication(state, applicationId, (app) => {
    if (formatCalendarDate(app.dateApplied) === formatCalendarDate(parsed)) return null;
    return {
      ...app,
      dateApplied: parsed ? parsed.toISOString() : null,
      updatedAt: now.toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export function demoJobPostedAt(state: DemoState, job: DemoJob): Date {
  return new Date(new Date(state.seededAt).getTime() - job.postedHoursAgo * HOUR_MS);
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

/** What the tracker shows about the job behind an application. */
type TrackedJob = Pick<
  TrackedApplication,
  "companyName" | "title" | "jobUrl" | "location" | "workplaceType" | "fitScore"
>;

function trackedJobFor(app: DemoApplication): TrackedJob | null {
  if (app.job) {
    return {
      companyName: app.job.company,
      title: app.job.title,
      jobUrl: app.job.jobUrl,
      location: app.job.location,
      workplaceType: app.job.workplaceType,
      // Fit scores come from matching a posting against the sample profile; imports have none.
      fitScore: null,
    };
  }
  const job = getDemoJob(app.jobId);
  if (!job) return null;
  return {
    companyName: job.company,
    title: job.title,
    // Demo jobs are fictional, so there is no posting to link to.
    jobUrl: null,
    location: job.location,
    workplaceType: job.workplaceType,
    fitScore: job.fitScore,
  };
}

function toTracked(app: DemoApplication, job: TrackedJob, now: Date): TrackedApplication {
  const lastActivity = new Date(app.updatedAt);
  return {
    id: app.id,
    jobId: app.jobId,
    status: app.status,
    stage: pipelineStage(app.status),
    notes: app.notes,
    dateApplied: app.dateApplied,
    followUpDate: app.followUpDate,
    lastActivityAt: app.updatedAt,
    ...job,
    locationLabel: formatWorkLocation(job.location, job.workplaceType),
    attention: attentionFor({
      status: app.status,
      dateApplied: toDate(app.dateApplied),
      followUpDate: toDate(app.followUpDate),
      lastActivityAt: lastActivity,
      now,
    }),
  };
}

export function listDemoTrackedApplications(
  state: DemoState,
  now: Date = new Date()
): TrackedApplication[] {
  const tracked: TrackedApplication[] = [];
  for (const app of state.applications) {
    const job = trackedJobFor(app);
    if (job) tracked.push(toTracked(app, job, now));
  }
  return tracked;
}

export function getDemoTrackedApplicationForJob(
  state: DemoState,
  jobId: string,
  now: Date = new Date()
): TrackedApplication | null {
  const app = state.applications.find((candidate) => candidate.jobId === jobId);
  const job = app ? trackedJobFor(app) : null;
  return app && job ? toTracked(app, job, now) : null;
}

export type DemoFeedSort = "match" | "newest" | "salary";
export type DemoWorkplaceFilter = "all" | DemoJob["workplaceType"];

export type DemoFeedFilters = {
  search: string;
  workplace: DemoWorkplaceFilter;
  sort: DemoFeedSort;
  showDismissed: boolean;
};

export const DEFAULT_DEMO_FEED_FILTERS: DemoFeedFilters = {
  search: "",
  workplace: "all",
  sort: "match",
  showDismissed: false,
};

export type DemoFeedItem = {
  job: DemoJob;
  postedAt: Date;
  isSaved: boolean;
  isDismissed: boolean;
  trackedStatus: ApplicationStatus | null;
};

function matchesSearch(job: DemoJob, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [job.title, job.company, job.location, ...job.technologies].some((value) =>
    value.toLowerCase().includes(needle)
  );
}

export function selectDemoFeed(
  state: DemoState,
  filters: DemoFeedFilters
): { items: DemoFeedItem[]; dismissedCount: number } {
  const saved = new Set(state.savedJobIds);
  const dismissed = new Set(state.dismissedJobIds);
  const statusByJob = new Map(state.applications.map((app) => [app.jobId, app.status]));

  const items: DemoFeedItem[] = [];
  for (const job of DEMO_JOBS) {
    const isDismissed = dismissed.has(job.id);
    if (isDismissed && !filters.showDismissed) continue;
    if (filters.workplace !== "all" && job.workplaceType !== filters.workplace) continue;
    if (!matchesSearch(job, filters.search)) continue;
    items.push({
      job,
      postedAt: demoJobPostedAt(state, job),
      isSaved: saved.has(job.id),
      isDismissed,
      trackedStatus: statusByJob.get(job.id) ?? null,
    });
  }

  items.sort((a, b) => {
    if (filters.sort === "newest") {
      return b.postedAt.getTime() - a.postedAt.getTime();
    }
    if (filters.sort === "salary") {
      return (b.job.salaryMax ?? b.job.salaryMin ?? 0) - (a.job.salaryMax ?? a.job.salaryMin ?? 0);
    }
    return b.job.fitScore - a.job.fitScore;
  });

  return {
    items,
    dismissedCount: DEMO_JOBS.filter((job) => dismissed.has(job.id)).length,
  };
}
