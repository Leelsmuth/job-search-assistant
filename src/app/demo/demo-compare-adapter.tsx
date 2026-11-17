"use client";

import { useMemo } from "react";
import { CompareProvider, type CompareAdapter } from "@/components/compare/compare-context";
import { statusLabel } from "@/modules/applications/tracker";
import {
  DEMO_COMPARE_CATALOG,
  compareJobs,
  demoCompareRole,
} from "@/modules/demo/demo-compare";
import { demoJobPostedAt, type DemoState } from "@/modules/demo/demo-state";
import { getDemoJob } from "@/modules/demo/sample-jobs";
import { demoCompareActions, useDemoCompare } from "./demo-compare-store";
import { demoPriorityActions, useDemoPrioritiesState } from "./demo-priorities-store";
import { useDemoState } from "./demo-store";
import { demoJobHref } from "./demo-links";

const DEMO_COPY: CompareAdapter["copy"] = {
  savedWhere: "in this browser",
  saveFailed:
    "This browser is not letting the demo save, so your order lasts until you reload. Private windows and blocked site data do this.",
  skillsNote: "Ticked skills are on the sample profile",
};

function trackerText(state: DemoState, jobId: string): string {
  const application = state.applications.find((app) => app.jobId === jobId);
  const text = application
    ? statusLabel(application.status)
    : state.savedJobIds.includes(jobId)
      ? "Saved"
      : "Not saved";
  return state.dismissedJobIds.includes(jobId) ? `${text} (dismissed)` : text;
}

function summary(id: string) {
  const job = getDemoJob(id);
  return job ? { id: job.id, title: job.title, company: job.company, fitScore: job.fitScore } : null;
}

/**
 * Backs the shared compare tray, comparison, and priority ranker with the
 * demo's browser stores: the tray in sessionStorage, priorities in localStorage.
 */
export function DemoCompareProvider({ children }: { children: React.ReactNode }) {
  const compare = useDemoCompare();
  const priorities = useDemoPrioritiesState();
  const demo = useDemoState();

  const adapter = useMemo((): CompareAdapter | null => {
    if (!compare || !priorities || !demo) return null;
    return {
      slots: compare.slots,
      draggingId: compare.draggingId,
      notice: compare.notice,
      catalog: DEMO_COMPARE_CATALOG,
      summary,
      roles: compareJobs(compare.slots).map((job) =>
        demoCompareRole(job, {
          postedAt: demoJobPostedAt(demo, job),
          trackerStatus: trackerText(demo, job.id),
          href: demoJobHref(job.id),
        })
      ),
      place: (id, slot) => void demoCompareActions.add(id, slot),
      remove: demoCompareActions.remove,
      clear: demoCompareActions.clear,
      startDrag: demoCompareActions.startDrag,
      endDrag: demoCompareActions.endDrag,
      priorities: { order: priorities.order, save: priorities.save, savedAt: priorities.savedAt },
      movePriority: demoPriorityActions.move,
      resetPriorities: demoPriorityActions.useSuggested,
      copy: DEMO_COPY,
    };
  }, [compare, priorities, demo]);

  return <CompareProvider adapter={adapter}>{children}</CompareProvider>;
}
