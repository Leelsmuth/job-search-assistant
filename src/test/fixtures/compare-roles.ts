import type { CompareRole } from "@/modules/compare/role";
import { demoCompareRole } from "@/modules/demo/demo-compare";
import { getDemoJob } from "@/modules/demo/sample-jobs";

/** A fixed "now", so posting ages (and freshness points) never drift. */
export const COMPARE_NOW = new Date("2026-06-01T12:00:00.000Z");

/**
 * A demo sample job as a CompareRole, posted `postedHoursAgo` before
 * COMPARE_NOW, with any fields overridden.
 */
export function sampleRole(id: string, overrides: Partial<CompareRole> = {}): CompareRole {
  const job = getDemoJob(id);
  if (!job) throw new Error(`missing sample job ${id}`);
  const postedAt = new Date(COMPARE_NOW.getTime() - job.postedHoursAgo * 3_600_000);
  return {
    ...demoCompareRole(job, { postedAt, trackerStatus: "Not saved", href: `/demo/jobs/${id}` }),
    ...overrides,
  };
}

// Fit 91, CAD 140–165k, remote, Canada, 5h old.
export const NORTHWIND = "northwind-senior-frontend";
// Fit 86, CAD 115–135k, hybrid, Toronto, 20h old.
export const MAPLE = "maple-pine-design-systems";
// Fit 83, CAD 125–145k, remote, Canada, 12h old.
export const QUILL = "quill-graphql-frontend";
// Fit 80, USD 170–200k, remote, needs US work authorization.
export const TIDEWATER = "tidewater-web-platform";
// Fit 78, CAD 180–210k, remote, Canada, 2 days old.
export const LUMEN = "lumen-staff-frontend";
// Fit 70, CAD 120–150k, on-site, out of area.
export const AURORA = "aurora-react-native";
// Fit 58, CAD 70–85k, on-site in the GTA.
export const PIXEL = "pixel-orchard-junior";
