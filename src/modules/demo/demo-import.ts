/**
 * Importing spreadsheet rows into the demo tracker. Pure, like demo-state.ts:
 * the browser store applies the result.
 *
 * - New rows become imported applications, except a row naming a sample job
 *   that is not tracked yet, which becomes that job's application. That keeps
 *   an exported demo importable after Reset without doubling the sample jobs.
 * - "Update" writes the row's non-blank values over the matched application.
 *   Blank cells never erase anything.
 * - Duplicates are found against the state being imported into, so the result
 *   is right even if another tab changed the demo while the dialog was open.
 */
import {
  findImportDuplicates,
  planImport,
  summarizePlan,
  type DuplicateResolution,
  type ImportDuplicate,
  type ImportPlanItem,
  type ImportRowResult,
  type ImportSummary,
  type ImportValues,
} from "@/modules/applications/tracker-csv";
import type { TrackedApplication } from "@/modules/applications/tracker";
import {
  planTrackedUpdate,
  type ImportCandidate,
  type TrackedUpdateChange,
} from "@/modules/applications/tracker-import";
import {
  demoApplicationId,
  demoImportedJobId,
  isDemoImportedJobId,
  listDemoTrackedApplications,
  type DemoApplication,
  type DemoState,
} from "./demo-state";
import { DEMO_JOBS, type DemoJob } from "./sample-jobs";

/** Imported applications the demo keeps, so the state stays well inside browser storage limits. */
export const MAX_DEMO_IMPORTED_APPLICATIONS = 500;

export class DemoImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoImportError";
  }
}

/** Duplicates for the preview, computed against the tracker as it is now. */
export function findDemoImportDuplicates(
  state: DemoState,
  rows: readonly ImportRowResult[]
): Map<number, ImportDuplicate<TrackedApplication>> {
  return findImportDuplicates(rows, listDemoTrackedApplications(state));
}

/** Calendar dates are stored at UTC noon, like the rest of the tracker. */
function calendarNoon(date: string | null): string | null {
  return date ? `${date}T12:00:00.000Z` : null;
}

function sameText(a: string, b: string): boolean {
  return a.localeCompare(b, "en", { sensitivity: "base" }) === 0;
}

function untrackedSampleJob(values: ImportValues, tracked: ReadonlySet<string>): DemoJob | null {
  return (
    DEMO_JOBS.find(
      (job) =>
        !tracked.has(job.id) && sameText(job.company, values.company) && sameText(job.title, values.title)
    ) ?? null
  );
}

function nextImportSequence(state: DemoState): number {
  let max = 0;
  for (const app of state.applications) {
    if (isDemoImportedJobId(app.jobId)) max = Math.max(max, Number(app.jobId.slice("import-".length)));
  }
  return max + 1;
}

/**
 * The spreadsheet's applied date is the last thing known to have happened, so
 * it stands in for "last activity". That way a role applied to a month ago is
 * flagged as stale straight away, as it would be if it had been tracked here.
 */
function importedActivityAt(values: ImportValues, now: Date): string {
  const applied = calendarNoon(values.dateApplied);
  if (applied && new Date(applied).getTime() < now.getTime()) return applied;
  return now.toISOString();
}

function newApplication(
  values: ImportValues,
  ids: { id: string; jobId: string },
  now: Date
): DemoApplication {
  return {
    ...ids,
    status: values.status,
    notes: values.notes,
    dateSaved: now.toISOString(),
    dateApplied: calendarNoon(values.dateApplied),
    followUpDate: calendarNoon(values.followUpDate),
    updatedAt: importedActivityAt(values, now),
  };
}

/** The tracked applications in the shape the shared import code matches and updates against. */
export function demoImportCandidates(state: DemoState, now: Date = new Date()): ImportCandidate[] {
  return listDemoTrackedApplications(state, now).map((tracked) => ({
    id: tracked.id,
    companyName: tracked.companyName,
    title: tracked.title,
    jobUrl: tracked.jobUrl,
    status: tracked.status,
    dateApplied: tracked.dateApplied,
    followUpDate: tracked.followUpDate,
    notes: tracked.notes,
    location: tracked.location,
    workplaceType: tracked.workplaceType,
    // A sample job's details are fixed; an imported job's come from the visitor's file.
    jobDetailsEditable: isDemoImportedJobId(tracked.jobId),
  }));
}

/**
 * Apply "Update" to one application, with the same rules as the signed-in
 * tracker (planTrackedUpdate). Returns null when nothing changes.
 */
function updatedApplication(
  state: DemoState,
  app: DemoApplication,
  values: ImportValues,
  now: Date
): DemoApplication | null {
  const [candidate] = demoImportCandidates({ ...state, applications: [app] }, now);
  if (!candidate) return null;
  const update = planTrackedUpdate(candidate, values);
  if (update.changes.length === 0) return null;
  const next: DemoApplication = { ...app, updatedAt: now.toISOString() };
  const fields = update.application;
  if (fields.status) next.status = fields.status;
  if (fields.dateApplied) next.dateApplied = calendarNoon(fields.dateApplied);
  if (fields.followUpDate) next.followUpDate = calendarNoon(fields.followUpDate);
  if (fields.notes) next.notes = fields.notes;
  if (app.job) {
    next.job = {
      ...app.job,
      location: update.job.location ?? app.job.location,
      workplaceType: update.job.workplaceType ?? app.job.workplaceType,
      jobUrl: update.job.jobUrl ?? app.job.jobUrl,
    };
  }
  return next;
}

export type DemoImportResult = {
  state: DemoState;
  summary: ImportSummary & { unchanged: number };
};

export function applyDemoImportPlan(
  state: DemoState,
  plan: readonly ImportPlanItem[],
  now: Date = new Date()
): DemoImportResult {
  const applications = state.applications.slice();
  const indexById = new Map(applications.map((app, index) => [app.id, index]));
  const trackedJobs = new Set(applications.map((app) => app.jobId));
  let savedJobIds = state.savedJobIds;
  let dismissedJobIds = state.dismissedJobIds;
  let sequence = nextImportSequence(state);
  let unchanged = 0;

  const imported = applications.filter((app) => app.job).length;
  const adding = plan.filter((item) => item.action === "add").length;
  if (imported + adding > MAX_DEMO_IMPORTED_APPLICATIONS) {
    throw new DemoImportError(
      `The demo holds up to ${MAX_DEMO_IMPORTED_APPLICATIONS} imported applications and already has ${imported}. Import fewer rows, or reset the demo first.`
    );
  }

  for (const item of plan) {
    if (item.action === "skip") continue;

    if (item.action === "update") {
      const index = indexById.get(item.applicationId);
      if (index === undefined) throw new DemoImportError("Application not found");
      const next = updatedApplication(state, applications[index], item.values, now);
      if (next) applications[index] = next;
      else unchanged++;
      continue;
    }

    const sample = untrackedSampleJob(item.values, trackedJobs);
    if (sample) {
      // Same as saving the sample job from the feed, with the row's progress on top.
      applications.push(
        newApplication(item.values, { id: demoApplicationId(sample.id), jobId: sample.id }, now)
      );
      trackedJobs.add(sample.id);
      if (!savedJobIds.includes(sample.id)) savedJobIds = [...savedJobIds, sample.id];
      dismissedJobIds = dismissedJobIds.filter((id) => id !== sample.id);
      continue;
    }

    const jobId = demoImportedJobId(sequence++);
    applications.push({
      ...newApplication(item.values, { id: demoApplicationId(jobId), jobId }, now),
      job: {
        company: item.values.company,
        title: item.values.title,
        location: item.values.location,
        workplaceType: item.values.workplaceType,
        jobUrl: item.values.jobUrl,
      },
    });
    trackedJobs.add(jobId);
  }

  const base = summarizePlan(plan);
  const summary = { ...base, update: base.update - unchanged, unchanged };
  // Nothing added or changed: hand back the same object so the store skips the write.
  if (summary.add === 0 && summary.update === 0) return { state, summary };
  return { state: { ...state, applications, savedJobIds, dismissedJobIds }, summary };
}

/** What "Update" would change on an application, for the duplicates step. */
export function previewDemoUpdate(
  state: DemoState,
  applicationId: string,
  values: ImportValues,
  now: Date = new Date()
): TrackedUpdateChange[] {
  const candidate = demoImportCandidates(state, now).find((item) => item.id === applicationId);
  return candidate ? planTrackedUpdate(candidate, values).changes : [];
}

/** Find duplicates, apply the visitor's choices, and import, all against `state`. */
export function importIntoDemo(
  state: DemoState,
  rows: readonly ImportRowResult[],
  resolutions: Readonly<Record<number, DuplicateResolution>>,
  now: Date = new Date()
): DemoImportResult {
  const plan = planImport(rows, findDemoImportDuplicates(state, rows), resolutions);
  return applyDemoImportPlan(state, plan, now);
}
