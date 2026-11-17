/**
 * The compare tray and comparison for the demo feed: the shared rules in
 * src/modules/compare, bound to the demo's sample jobs. The browser store
 * (src/app/demo/demo-compare-store.ts) keeps the tray per tab.
 *
 * Only sample jobs can be compared. Live jobs are not scored and carry no
 * salary or requirements, so a comparison of them would be mostly blanks.
 */
import { locationBlocker, type CompareRole } from "@/modules/compare/role";
import {
  COMPARE_DRAG_TYPE,
  COMPARE_MAX,
  COMPARE_MIN,
  compareDropPreview as dropPreview,
  compareNotice as notice,
  compareRejection as rejection,
  filledIds,
  parseCompareSlots as parseSlots,
  placeInCompare as place,
  type CompareCatalog,
  type ComparePlacement,
  type CompareSlots,
} from "@/modules/compare/slots";
import { getDemoJob, isDemoJobId, type DemoJob } from "@/modules/demo/sample-jobs";

export {
  EMPTY_COMPARE_SLOTS,
  canCompare,
  filledIds,
  removeFromCompare,
  type CompareOutcome,
  type ComparePlacement,
  type CompareSlots,
  type CompareNotice,
  type CompareDropPreview,
} from "@/modules/compare/slots";

export const DEMO_COMPARE_MIN = COMPARE_MIN;
export const DEMO_COMPARE_MAX = COMPARE_MAX;
export const DEMO_COMPARE_DRAG_TYPE = COMPARE_DRAG_TYPE;

/** Sample jobs only. */
export const DEMO_COMPARE_CATALOG: CompareCatalog = {
  isKnown: isDemoJobId,
  describe: (id) => getDemoJob(id),
};

export function placeInCompare(slots: CompareSlots, jobId: string, target?: number): ComparePlacement {
  return place(slots, jobId, target, DEMO_COMPARE_CATALOG);
}

export function compareRejection(slots: CompareSlots, jobId: string, target?: number) {
  return rejection(slots, jobId, target, DEMO_COMPARE_CATALOG);
}

export function compareDropPreview(slots: CompareSlots, jobId: string, target?: number) {
  return dropPreview(slots, jobId, target, DEMO_COMPARE_CATALOG);
}

export function compareNotice(
  placement: Parameters<typeof notice>[0],
  jobId: string
): ReturnType<typeof notice> {
  return notice(placement, jobId, DEMO_COMPARE_CATALOG);
}

/** Read a stored tray. Anything that is not a sample job becomes an empty slot. */
export function parseCompareSlots(value: unknown): CompareSlots {
  return parseSlots(value, isDemoJobId);
}

/** The sample jobs in the tray, in slot order. */
export function compareJobs(slots: CompareSlots): DemoJob[] {
  return filledIds(slots)
    .map(getDemoJob)
    .filter((job): job is DemoJob => job !== null);
}

/**
 * A sample job as the comparison sees it. The sample profile has no location
 * settings, so hybrid and on-site in the area both count as open.
 */
export function demoCompareRole(
  job: DemoJob,
  context: { postedAt: Date; trackerStatus: string; href: string }
): CompareRole {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    href: context.href,
    fitScore: job.fitScore,
    classification: job.classification,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    location: job.location,
    workplaceType: job.workplaceType,
    locationClass: job.locationClass,
    locationFlags: job.locationFlags,
    locationBlocker: locationBlocker(job.locationClass, job.locationFlags),
    postedAt: context.postedAt.toISOString(),
    postedAtSource: "provider",
    fitReasons: job.fitReasons,
    topConcern: job.topConcern,
    matchingSkills: job.matchingSkills,
    requirements: job.requirements,
    niceToHave: job.niceToHave,
    technologies: job.technologies,
    trackerStatus: context.trackerStatus,
    resumeScore: null,
  };
}
