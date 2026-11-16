import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEMO_FEED_FILTERS,
  DEMO_REFRESH_AFTER_MS,
  createDemoState,
  demoApplicationId,
  dismissDemoJob,
  getDemoTrackedApplicationForJob,
  isDemoStatePristine,
  listDemoTrackedApplications,
  parseDemoState,
  refreshStalePristineDemo,
  restoreDemoJob,
  saveDemoJob,
  selectDemoFeed,
  setDemoApplicationAppliedDate,
  setDemoApplicationFollowUp,
  setDemoApplicationNotes,
  setDemoApplicationStatus,
  unsaveDemoJob,
} from "@/modules/demo/demo-state";
import { DEMO_JOBS } from "@/modules/demo/sample-jobs";

const NOW = new Date("2025-06-10T15:00:00.000Z");
const LATER = new Date("2025-06-10T16:30:00.000Z");
const JOB = "northwind-senior-frontend";

function fresh() {
  return createDemoState(NOW);
}

describe("demo sample data", () => {
  it("has unique ids and no links to real postings", () => {
    const ids = DEMO_JOBS.map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    const state = fresh();
    for (const app of listDemoTrackedApplications(state, NOW)) {
      expect(app.jobUrl).toBeNull();
    }
  });

  it("seeds a tracker with one stale application and one follow-up due today", () => {
    const tracked = listDemoTrackedApplications(fresh(), NOW);
    expect(tracked.map((app) => [app.stage, app.attention])).toEqual([
      ["applied", ["stale_applied"]],
      ["interviewing", ["follow_up_due"]],
    ]);
  });

  it("starts with the target job untracked", () => {
    expect(getDemoTrackedApplicationForJob(fresh(), JOB, NOW)).toBeNull();
  });
});

describe("save → tracker → applied", () => {
  it("saving a job adds a saved application that shows in the tracker", () => {
    const state = saveDemoJob(fresh(), JOB, LATER);
    expect(state.savedJobIds).toContain(JOB);

    const tracked = getDemoTrackedApplicationForJob(state, JOB, LATER);
    expect(tracked).toMatchObject({
      id: demoApplicationId(JOB),
      status: "saved",
      stage: "saved",
      title: "Senior Frontend Engineer",
      companyName: "Northwind Labs",
      dateApplied: null,
      lastActivityAt: LATER.toISOString(),
      fitScore: 91,
      locationLabel: "Canada · Remote",
    });
    expect(listDemoTrackedApplications(state, LATER)).toHaveLength(3);
  });

  it("saving twice does not create a second application", () => {
    const once = saveDemoJob(fresh(), JOB, NOW);
    const twice = saveDemoJob(once, JOB, LATER);
    expect(twice.applications.filter((app) => app.jobId === JOB)).toHaveLength(1);
    expect(twice.savedJobIds.filter((id) => id === JOB)).toHaveLength(1);
  });

  it("moving to applied stamps the applied date once", () => {
    const saved = saveDemoJob(fresh(), JOB, NOW);
    const applied = setDemoApplicationStatus(saved, demoApplicationId(JOB), "applied", LATER);
    const tracked = getDemoTrackedApplicationForJob(applied, JOB, LATER)!;
    expect(tracked.stage).toBe("applied");
    expect(tracked.dateApplied).toBe(LATER.toISOString());

    const evenLater = new Date("2025-06-12T09:00:00.000Z");
    const interviewing = setDemoApplicationStatus(
      applied,
      demoApplicationId(JOB),
      "interviewing",
      evenLater
    );
    const back = setDemoApplicationStatus(interviewing, demoApplicationId(JOB), "applied", evenLater);
    expect(getDemoTrackedApplicationForJob(back, JOB, evenLater)!.dateApplied).toBe(
      LATER.toISOString()
    );
  });

  it("maps detailed statuses onto tracker stages", () => {
    const saved = saveDemoJob(fresh(), JOB, NOW);
    const screen = setDemoApplicationStatus(saved, demoApplicationId(JOB), "recruiter_screen", LATER);
    expect(getDemoTrackedApplicationForJob(screen, JOB, LATER)!.stage).toBe("interviewing");
  });

  it("returns the same state when the status does not change", () => {
    const saved = saveDemoJob(fresh(), JOB, NOW);
    expect(setDemoApplicationStatus(saved, demoApplicationId(JOB), "saved", LATER)).toBe(saved);
  });

  it("rejects unknown statuses and applications", () => {
    const saved = saveDemoJob(fresh(), JOB, NOW);
    expect(() => setDemoApplicationStatus(saved, demoApplicationId(JOB), "hired", LATER)).toThrow(
      "Unknown status"
    );
    expect(() => setDemoApplicationStatus(saved, "nope", "applied", LATER)).toThrow(
      "Application not found"
    );
    expect(() => saveDemoJob(saved, "not-a-demo-job", LATER)).toThrow("Job not found");
  });

  it("keeps the application when a job is unsaved, like the real tracker", () => {
    const saved = saveDemoJob(fresh(), JOB, NOW);
    const unsaved = unsaveDemoJob(saved, JOB);
    expect(unsaved.savedJobIds).not.toContain(JOB);
    expect(getDemoTrackedApplicationForJob(unsaved, JOB, LATER)).not.toBeNull();
  });
});

describe("tracker edits", () => {
  const appId = demoApplicationId(JOB);

  it("saves trimmed notes and ignores no-op edits", () => {
    const saved = saveDemoJob(fresh(), JOB, NOW);
    const noted = setDemoApplicationNotes(saved, appId, "  Ask about team size  ", LATER);
    expect(getDemoTrackedApplicationForJob(noted, JOB, LATER)!.notes).toBe("Ask about team size");
    expect(setDemoApplicationNotes(noted, appId, "Ask about team size", LATER)).toBe(noted);
  });

  it("sets, validates, and clears the follow-up date", () => {
    const saved = saveDemoJob(fresh(), JOB, NOW);
    const withFollowUp = setDemoApplicationFollowUp(saved, appId, "2025-06-10", LATER);
    const tracked = getDemoTrackedApplicationForJob(withFollowUp, JOB, LATER)!;
    expect(tracked.followUpDate).toBe("2025-06-10T12:00:00.000Z");
    expect(tracked.attention).toEqual(["follow_up_due"]);

    expect(() => setDemoApplicationFollowUp(saved, appId, "2025-02-30", LATER)).toThrow(
      "Follow-up date must be YYYY-MM-DD"
    );

    const cleared = setDemoApplicationFollowUp(withFollowUp, appId, "", LATER);
    expect(getDemoTrackedApplicationForJob(cleared, JOB, LATER)!.followUpDate).toBeNull();
  });

  it("edits the applied date", () => {
    const saved = saveDemoJob(fresh(), JOB, NOW);
    const dated = setDemoApplicationAppliedDate(saved, appId, "2025-06-01", LATER);
    expect(getDemoTrackedApplicationForJob(dated, JOB, LATER)!.dateApplied).toBe(
      "2025-06-01T12:00:00.000Z"
    );
  });
});

describe("demo feed", () => {
  it("sorts by fit by default and marks saved and tracked jobs", () => {
    const state = saveDemoJob(fresh(), JOB, NOW);
    const { items } = selectDemoFeed(state, DEFAULT_DEMO_FEED_FILTERS);
    const scores = items.map((item) => item.job.fitScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const first = items[0];
    expect(first.job.id).toBe(JOB);
    expect(first.isSaved).toBe(true);
    expect(first.trackedStatus).toBe("saved");
  });

  it("hides dismissed jobs until asked, and restore brings them back", () => {
    const dismissed = dismissDemoJob(fresh(), JOB);
    const hidden = selectDemoFeed(dismissed, DEFAULT_DEMO_FEED_FILTERS);
    expect(hidden.items.some((item) => item.job.id === JOB)).toBe(false);
    expect(hidden.dismissedCount).toBe(1);

    const shown = selectDemoFeed(dismissed, { ...DEFAULT_DEMO_FEED_FILTERS, showDismissed: true });
    expect(shown.items.find((item) => item.job.id === JOB)?.isDismissed).toBe(true);

    const restored = restoreDemoJob(dismissed, JOB);
    expect(selectDemoFeed(restored, DEFAULT_DEMO_FEED_FILTERS).dismissedCount).toBe(0);
  });

  it("saving a dismissed job brings it back into the feed", () => {
    const state = saveDemoJob(dismissDemoJob(fresh(), JOB), JOB, LATER);
    expect(state.dismissedJobIds).not.toContain(JOB);
  });

  it("filters by search text and workplace", () => {
    const state = fresh();
    const vue = selectDemoFeed(state, { ...DEFAULT_DEMO_FEED_FILTERS, search: "vue" });
    expect(vue.items.map((item) => item.job.id)).toEqual(["brightlane-vue"]);

    const onsite = selectDemoFeed(state, { ...DEFAULT_DEMO_FEED_FILTERS, workplace: "on_site" });
    expect(onsite.items.every((item) => item.job.workplaceType === "on_site")).toBe(true);
    expect(onsite.items.length).toBeGreaterThan(0);
  });

  it("sorts by newest posting", () => {
    const { items } = selectDemoFeed(fresh(), { ...DEFAULT_DEMO_FEED_FILTERS, sort: "newest" });
    const times = items.map((item) => item.postedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe("parseDemoState", () => {
  it("round-trips through JSON", () => {
    const state = setDemoApplicationStatus(
      saveDemoJob(fresh(), JOB, NOW),
      demoApplicationId(JOB),
      "applied",
      LATER
    );
    expect(parseDemoState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("rejects corrupt or outdated state so the store can reseed", () => {
    expect(parseDemoState(null)).toBeNull();
    expect(parseDemoState("oops")).toBeNull();
    expect(parseDemoState({ ...fresh(), version: 0 })).toBeNull();
    expect(parseDemoState({ ...fresh(), seededAt: "not a date" })).toBeNull();
    const badStatus = fresh();
    expect(
      parseDemoState({
        ...badStatus,
        applications: [{ ...badStatus.applications[0], status: "hired" }],
      })
    ).toBeNull();
  });

  it("drops unknown job ids and duplicate applications", () => {
    const state = fresh();
    const parsed = parseDemoState({
      ...state,
      savedJobIds: [...state.savedJobIds, "deleted-job", state.savedJobIds[0]],
      applications: [...state.applications, { ...state.applications[0], id: "duplicate" }],
    });
    expect(parsed?.savedJobIds).toEqual(state.savedJobIds);
    expect(parsed?.applications).toEqual(state.applications);
  });
});

describe("isDemoStatePristine", () => {
  const appId = demoApplicationId("civic-form-accessibility");

  it("is true for a fresh seed, including after a round trip through storage", () => {
    expect(isDemoStatePristine(fresh())).toBe(true);
    expect(isDemoStatePristine(parseDemoState(JSON.parse(JSON.stringify(fresh())))!)).toBe(true);
  });

  it("is true again when a change is undone without leaving a trace", () => {
    expect(isDemoStatePristine(dismissDemoJob(fresh(), JOB))).toBe(false);
    expect(isDemoStatePristine(restoreDemoJob(dismissDemoJob(fresh(), JOB), JOB))).toBe(true);
  });

  it("is false after any change that shows up in the feed or tracker", () => {
    const changed = [
      saveDemoJob(fresh(), JOB, LATER),
      // Unsaving keeps the new application, so the tracker still differs.
      unsaveDemoJob(saveDemoJob(fresh(), JOB, LATER), JOB),
      unsaveDemoJob(fresh(), "civic-form-accessibility"),
      setDemoApplicationStatus(fresh(), appId, "offer", LATER),
      setDemoApplicationNotes(fresh(), appId, "New note", LATER),
      setDemoApplicationFollowUp(fresh(), appId, "", LATER),
      setDemoApplicationAppliedDate(fresh(), appId, "2025-06-01", LATER),
    ];
    for (const state of changed) expect(isDemoStatePristine(state)).toBe(false);
  });

  it("ignores edits that change nothing", () => {
    const seededNote = fresh().applications.find((app) => app.id === appId)!.notes!;
    expect(isDemoStatePristine(setDemoApplicationNotes(fresh(), appId, seededNote, LATER))).toBe(
      true
    );
    expect(isDemoStatePristine(setDemoApplicationStatus(fresh(), appId, "interviewing", LATER))).toBe(
      true
    );
  });
});

describe("refreshStalePristineDemo", () => {
  const after = (ms: number) => new Date(NOW.getTime() + ms);

  it("leaves a demo younger than the cutoff alone", () => {
    const state = fresh();
    expect(refreshStalePristineDemo(state, after(DEMO_REFRESH_AFTER_MS - 1))).toBe(state);
  });

  it("reseeds an untouched demo at the cutoff with current dates", () => {
    const later = after(DEMO_REFRESH_AFTER_MS);
    const refreshed = refreshStalePristineDemo(fresh(), later);
    expect(refreshed).toEqual(createDemoState(later));
    expect(refreshed.seededAt).toBe(later.toISOString());
    expect(isDemoStatePristine(refreshed)).toBe(true);

    // The seeded tracker flags stay meaningful: follow-up due "today" again.
    const tracked = listDemoTrackedApplications(refreshed, later);
    expect(tracked.map((app) => app.attention)).toEqual([["stale_applied"], ["follow_up_due"]]);
  });

  it("reseeds an untouched demo read back from storage", () => {
    const stored = parseDemoState(JSON.parse(JSON.stringify(fresh()))) as ReturnType<typeof fresh>;
    const later = after(30 * DEMO_REFRESH_AFTER_MS);
    expect(refreshStalePristineDemo(stored, later).seededAt).toBe(later.toISOString());
  });

  it("never replaces a demo the visitor has changed", () => {
    const changed = saveDemoJob(fresh(), JOB, LATER);
    expect(refreshStalePristineDemo(changed, after(30 * DEMO_REFRESH_AFTER_MS))).toBe(changed);
  });

  it("leaves the demo alone if the clock moved backwards", () => {
    const state = fresh();
    expect(refreshStalePristineDemo(state, after(-DEMO_REFRESH_AFTER_MS))).toBe(state);
  });
});
