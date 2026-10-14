import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STALE_APPLIED_MS,
  attentionFor,
  describeEvent,
  isFollowUpDue,
  isStaleApplied,
  latestActivityAt,
  parseCalendarDate,
  parseManualApplication,
  parseTrackerQuery,
  pipelineStage,
  selectApplications,
  statusOptions,
  trackerHref,
} from "@/modules/applications/tracker";

const now = new Date("2026-10-14T15:00:00.000Z");

describe("application tracker pipeline", () => {
  it("groups earlier steps into saved and interview steps into interviewing", () => {
    expect(pipelineStage("discovered")).toBe("saved");
    expect(pipelineStage("reviewing")).toBe("saved");
    expect(pipelineStage("preparing")).toBe("saved");
    expect(pipelineStage("ready_to_apply")).toBe("saved");
    expect(pipelineStage("saved")).toBe("saved");
    expect(pipelineStage("applied")).toBe("applied");
    expect(pipelineStage("interviewing")).toBe("interviewing");
    expect(pipelineStage("recruiter_screen")).toBe("interviewing");
    expect(pipelineStage("technical_interview")).toBe("interviewing");
    expect(pipelineStage("final_interview")).toBe("interviewing");
    expect(pipelineStage("offer")).toBe("offer");
    expect(pipelineStage("rejected")).toBe("rejected");
    expect(pipelineStage("withdrawn")).toBe("withdrawn");
  });

  it("keeps a legacy status available in the inline control", () => {
    expect(statusOptions("recruiter_screen")).toContain("interviewing");
    expect(statusOptions("recruiter_screen")).toContain("recruiter_screen");
    expect(statusOptions("applied")).not.toContain("recruiter_screen");
  });
});

describe("application attention", () => {
  it("marks a follow-up due today and ignores a future date", () => {
    expect(isFollowUpDue(new Date("2026-10-14T12:00:00.000Z"), now)).toBe(true);
    expect(isFollowUpDue(new Date("2026-10-13T12:00:00.000Z"), now)).toBe(true);
    expect(isFollowUpDue(new Date("2026-10-15T12:00:00.000Z"), now)).toBe(false);
    expect(isFollowUpDue(null, now)).toBe(false);
  });

  it("marks applied applications that have been idle for 14 days", () => {
    const applied = new Date(now.getTime() - STALE_APPLIED_MS);
    expect(
      isStaleApplied({
        status: "applied",
        dateApplied: applied,
        lastActivityAt: applied,
        now,
      })
    ).toBe(true);
    expect(
      isStaleApplied({
        status: "applied",
        dateApplied: new Date(now.getTime() - STALE_APPLIED_MS + 60_000),
        lastActivityAt: new Date(now.getTime() - STALE_APPLIED_MS + 60_000),
        now,
      })
    ).toBe(false);
  });

  it("treats later notes or events as activity", () => {
    expect(
      isStaleApplied({
        status: "applied",
        dateApplied: new Date("2026-09-01T12:00:00.000Z"),
        lastActivityAt: new Date("2026-10-13T12:00:00.000Z"),
        now,
      })
    ).toBe(false);
    expect(
      isStaleApplied({
        status: "interviewing",
        dateApplied: new Date("2026-09-01T12:00:00.000Z"),
        lastActivityAt: new Date("2026-09-01T12:00:00.000Z"),
        now,
      })
    ).toBe(false);
  });

  it("can flag a due follow-up and a stale application together", () => {
    const applied = new Date("2026-09-01T12:00:00.000Z");
    expect(
      attentionFor({
        status: "applied",
        dateApplied: applied,
        followUpDate: new Date("2026-10-10T12:00:00.000Z"),
        lastActivityAt: applied,
        now,
      })
    ).toEqual(["follow_up_due", "stale_applied"]);
  });

  it("uses the newest event as last activity", () => {
    const updated = new Date("2026-10-01T00:00:00.000Z");
    const latest = latestActivityAt(updated, [
      { createdAt: new Date("2026-10-02T00:00:00.000Z"), eventDate: null },
      { createdAt: new Date("2026-10-03T00:00:00.000Z"), eventDate: new Date("2026-10-04T00:00:00.000Z") },
    ]);
    expect(latest.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });
});

describe("application tracker views", () => {
  const rows = [
    {
      stage: "applied" as const,
      dateApplied: "2026-10-01T00:00:00.000Z",
      lastActivityAt: "2026-10-02T00:00:00.000Z",
      companyName: "B",
      title: "Engineer",
    },
    {
      stage: "saved" as const,
      dateApplied: null,
      lastActivityAt: "2026-10-10T00:00:00.000Z",
      companyName: "A",
      title: "Engineer",
    },
    {
      stage: "applied" as const,
      dateApplied: "2026-10-05T00:00:00.000Z",
      lastActivityAt: "2026-10-01T00:00:00.000Z",
      companyName: "C",
      title: "Engineer",
    },
    {
      stage: "interviewing" as const,
      dateApplied: "2026-09-20T00:00:00.000Z",
      lastActivityAt: "2026-10-08T00:00:00.000Z",
      companyName: "D",
      title: "Engineer",
    },
  ];

  it("sorts by applied date and last activity, with missing dates last", () => {
    expect(
      selectApplications(rows, { status: "all", sort: "applied", dir: "desc" }).map(
        (row) => row.companyName
      )
    ).toEqual(["C", "B", "D", "A"]);
    expect(
      selectApplications(rows, { status: "all", sort: "activity", dir: "desc" }).map(
        (row) => row.companyName
      )
    ).toEqual(["A", "D", "B", "C"]);
  });

  it("filters by pipeline stage", () => {
    expect(
      selectApplications(rows, { status: "applied", sort: "activity", dir: "desc" }).map(
        (row) => row.companyName
      )
    ).toEqual(["B", "C"]);
  });

  it("keeps the board alias and default sort", () => {
    expect(parseTrackerQuery({ view: "kanban" })).toEqual({
      view: "board",
      status: "all",
      sort: "activity",
      dir: "desc",
    });
    expect(trackerHref(parseTrackerQuery({ view: "board", status: "offer" }))).toBe(
      "/applications?view=board&status=offer"
    );
  });
});

describe("manual applications and timeline copy", () => {
  it("accepts a job found outside the feed", () => {
    const parsed = parseManualApplication({
      company: "  Northwind   Labs ",
      title: "Senior Frontend Engineer",
      jobUrl: "https://example.com/jobs/123",
      location: "Toronto",
      workplaceType: "remote",
      status: "applied",
      dateApplied: "2026-10-01",
      followUpDate: "2026-10-20",
      notes: "Recruiter replied",
    });
    expect(parsed.company).toBe("Northwind Labs");
    expect(parsed.jobUrl).toBe("https://example.com/jobs/123");
    expect(parsed.workplaceType).toBe("remote");
    expect(parsed.dateApplied?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("rejects missing fields and non-http links", () => {
    expect(() => parseManualApplication({ company: "", title: "Role", jobUrl: "https://example.com" })).toThrow(
      /Company/
    );
    expect(() =>
      parseManualApplication({ company: "Acme", title: "Role", jobUrl: "javascript:alert(1)" })
    ).toThrow(/http/);
    expect(() => parseCalendarDate("2026-02-31", "Applied date")).toThrow(/YYYY-MM-DD/);
  });

  it("describes status changes and assisted-apply snapshots", () => {
    expect(
      describeEvent({
        eventType: "status_changed",
        notes: null,
        payload: { kind: "status_change", fromStatus: "saved", toStatus: "interviewing" },
      }).title
    ).toBe("Status changed from Saved to Interviewing");

    const assisted = describeEvent({
      eventType: "marked_applied",
      notes: "Assisted apply snapshot. The application was not submitted by the app.",
      payload: {
        kind: "assisted_apply",
        provider: "greenhouse",
        applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
        resumeVersionId: null,
        coverLetterId: null,
        answers: [{ question: "Work authorization", answer: "Canadian citizen", source: "profile", unsupportedClaims: [] }],
      },
    });
    expect(assisted.title).toBe("Marked as applied · greenhouse");
    expect(assisted.detail).toMatch(/not submitted by the app/);
  });
});

describe("application tracker migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0015_application_tracker_status.sql"),
    "utf8"
  );
  const actions = readFileSync(
    resolve(process.cwd(), "src/server/actions/application-tracker-actions.ts"),
    "utf8"
  );
  const store = readFileSync(resolve(process.cwd(), "src/modules/applications/store.ts"), "utf8");

  it("adds interviewing without creating tables or dropping data", () => {
    expect(migration).toContain(
      "ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'interviewing' AFTER 'applied'"
    );
    expect(migration).not.toContain("CREATE TABLE");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });

  it("writes status changes into application_events payload and does not fan out db calls", () => {
    expect(store).toContain('eventType: "status_changed"');
    expect(store).toContain('kind: "status_change"');
    expect(store).toContain('kind: "manual_add"');
    expect(store).toContain('kind: "follow_up"');
    expect(actions).not.toContain("Promise.all");
    expect(store).not.toContain("Promise.all");
    expect(actions).not.toMatch(/export (?!async function)/);
  });
});
