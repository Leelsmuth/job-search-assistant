import { describe, expect, it } from "vitest";
import { scoreFrontendFit } from "@/modules/matching/frontend-fit";
import {
  decideDigestDelivery,
  digestHasContent,
  digestSubject,
  isFollowUpDueInToronto,
  resolveDigestWindow,
  selectDigestJobs,
  selectDigestReminders,
  torontoCalendarDate,
  wasDigestSentToday,
} from "@/modules/digest/select";
import type { DigestJobSource, DigestReminderSource } from "@/modules/digest/types";
import { defaultSearchPreferences } from "@/modules/matching/search-preferences";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const VISIBILITY = defaultSearchPreferences();

function job(overrides: Partial<DigestJobSource> & Pick<DigestJobSource, "id" | "title">): DigestJobSource {
  return {
    companyName: "Acme",
    location: "Remote - Canada",
    workplaceType: "remote",
    jobUrl: "https://example.com/jobs/1",
    dateDiscovered: new Date("2026-10-14T11:00:00.000Z"),
    status: "active",
    locationEligibility: "remote_canada",
    frontendFitScore: 80,
    frontendFitReasons: ["Title is a frontend or UI engineering role"],
    ...overrides,
  };
}

function reminder(overrides: Partial<DigestReminderSource> = {}): DigestReminderSource {
  return {
    id: "app-1",
    jobId: "job-1",
    status: "applied",
    title: "Frontend Engineer",
    companyName: "Acme",
    dateApplied: new Date("2026-09-01T12:00:00.000Z"),
    followUpDate: null,
    lastActivityAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("digest selection", () => {
  it("uses the Toronto calendar date", () => {
    expect(torontoCalendarDate(new Date("2026-10-14T03:30:00.000Z"))).toBe("2026-10-13");
    expect(torontoCalendarDate(NOW)).toBe("2026-10-14");
  });

  it("keeps remote Canada and GTA hybrid or on-site roles, and drops the rest by default", () => {
    const selected = selectDigestJobs({
      jobs: [
        job({ id: "ca", title: "Frontend Engineer", frontendFitScore: 70 }),
        job({
          id: "us",
          title: "Frontend Engineer",
          locationEligibility: "remote_other",
          frontendFitScore: 99,
        }),
        job({
          id: "hybrid",
          title: "UI Engineer",
          location: "Toronto",
          workplaceType: "hybrid",
          locationEligibility: "hybrid_gta",
          frontendFitScore: 60,
        }),
        job({
          id: "onsite",
          title: "React Developer",
          location: "Toronto",
          workplaceType: "on_site",
          locationEligibility: "onsite_gta",
          frontendFitScore: 55,
        }),
        job({
          id: "away",
          title: "Frontend Engineer",
          location: "Vancouver",
          workplaceType: "on_site",
          locationEligibility: "out_of_area",
          frontendFitScore: 95,
        }),
        job({ id: "gone", title: "Frontend Engineer", status: "dismissed", frontendFitScore: 100 }),
      ],
      visibility: VISIBILITY,
      gtaCities: VISIBILITY.gtaCities,
      profile: {},
    });

    expect(selected.map((item) => item.id)).toEqual(["ca", "hybrid", "onsite"]);
  });

  it("classifies a missing location snapshot with the existing rules", () => {
    const selected = selectDigestJobs({
      jobs: [
        job({
          id: "inferred",
          title: "Frontend Engineer",
          location: "Hybrid - Toronto",
          workplaceType: null,
          locationEligibility: null,
          frontendFitScore: 40,
        }),
      ],
      visibility: VISIBILITY,
      gtaCities: VISIBILITY.gtaCities,
      profile: {},
    });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.locationLabel).toContain("Hybrid-GTA");
  });

  it("ranks by frontend-fit score and keeps the top 10", () => {
    const jobs = Array.from({ length: 12 }, (_, index) =>
      job({
        id: `job-${index}`,
        title: `Frontend Engineer ${index}`,
        frontendFitScore: index,
        dateDiscovered: new Date(`2026-10-14T0${index < 10 ? index : 0}:00:00.000Z`),
      })
    );
    const selected = selectDigestJobs({
      jobs,
      visibility: VISIBILITY,
      gtaCities: VISIBILITY.gtaCities,
      profile: {},
      limit: 10,
    });
    expect(selected).toHaveLength(10);
    expect(selected[0]?.id).toBe("job-11");
    expect(selected[9]?.score).toBe(2);
    expect(selected.some((item) => item.id === "job-0")).toBe(false);
  });

  it("scores with the deterministic frontend-fit function when no snapshot exists", () => {
    const selected = selectDigestJobs({
      jobs: [
        job({
          id: "live",
          title: "Senior Frontend Engineer",
          technologies: ["React", "TypeScript"],
          frontendFitScore: null,
          frontendFitReasons: null,
        }),
      ],
      visibility: VISIBILITY,
      gtaCities: VISIBILITY.gtaCities,
      profile: { preferredSeniority: "senior", targetTitles: ["Frontend Engineer"] },
    });
    const expected = scoreFrontendFit(
      { title: "Senior Frontend Engineer", technologies: ["React", "TypeScript"] },
      { preferredSeniority: "senior", targetTitles: ["Frontend Engineer"] }
    );
    expect(selected[0]?.score).toBe(Math.round(expected.score));
    expect(selected[0]?.reason).toBe(expected.reasons[0]);
  });

  it("includes follow-ups due today or overdue in Toronto, and stale applied rows", () => {
    const reminders = selectDigestReminders(
      [
        reminder({
          id: "today",
          followUpDate: new Date("2026-10-14T12:00:00.000Z"),
          status: "saved",
          dateApplied: null,
          lastActivityAt: NOW,
        }),
        reminder({
          id: "overdue",
          followUpDate: new Date("2026-10-13T12:00:00.000Z"),
          status: "saved",
          dateApplied: null,
          lastActivityAt: NOW,
        }),
        reminder({
          id: "tomorrow",
          followUpDate: new Date("2026-10-15T12:00:00.000Z"),
          status: "saved",
          dateApplied: null,
          lastActivityAt: NOW,
        }),
        reminder({ id: "stale" }),
        reminder({
          id: "recent-activity",
          lastActivityAt: new Date("2026-10-13T12:00:00.000Z"),
        }),
        reminder({
          id: "too-soon",
          dateApplied: new Date("2026-10-02T12:00:00.000Z"),
          lastActivityAt: new Date("2026-10-02T12:00:00.000Z"),
        }),
        reminder({
          id: "interview",
          status: "interviewing",
          dateApplied: new Date("2026-09-01T12:00:00.000Z"),
          lastActivityAt: new Date("2026-09-01T12:00:00.000Z"),
        }),
      ],
      NOW
    );

    expect(reminders.followUps.map((item) => item.id)).toEqual(["overdue", "today"]);
    expect(reminders.followUps[0]?.overdue).toBe(true);
    expect(reminders.followUps[1]?.overdue).toBe(false);
    expect(reminders.staleApplied.map((item) => item.id)).toEqual(["stale"]);
    expect(reminders.staleApplied[0]?.daysQuiet).toBeGreaterThanOrEqual(14);
  });

  it("does not treat a follow-up as due until that Toronto date", () => {
    const lateUtcStillYesterdayInToronto = new Date("2026-10-14T03:30:00.000Z");
    expect(
      isFollowUpDueInToronto(new Date("2026-10-14T12:00:00.000Z"), lateUtcStillYesterdayInToronto)
    ).toBe(false);
    expect(
      isFollowUpDueInToronto(new Date("2026-10-13T12:00:00.000Z"), lateUtcStillYesterdayInToronto)
    ).toBe(true);
  });

  it("reuses the same window for a second run on the same Toronto day", () => {
    const firstStart = new Date("2026-10-13T12:00:00.000Z");
    const window = resolveDigestWindow({
      now: new Date("2026-10-14T18:00:00.000Z"),
      lastGeneratedAt: NOW,
      openDigest: { generatedAt: NOW, windowStart: firstStart },
    });
    expect(window.windowStart).toEqual(firstStart);
  });

  it("starts the next Toronto day after the previous digest", () => {
    const window = resolveDigestWindow({
      now: new Date("2026-10-15T12:00:00.000Z"),
      lastGeneratedAt: NOW,
      openDigest: { generatedAt: NOW, windowStart: new Date("2026-10-13T12:00:00.000Z") },
    });
    expect(window.windowStart).toEqual(NOW);
  });

  it("treats a send just before Toronto midnight as the previous day", () => {
    expect(wasDigestSentToday(new Date("2026-10-14T03:30:00.000Z"), NOW)).toBe(false);
    expect(wasDigestSentToday(NOW, new Date("2026-10-14T18:00:00.000Z"))).toBe(true);
  });

  it("skips email when there is nothing to say, when disabled, when already sent, or when Resend is unset", () => {
    expect(digestHasContent({ jobs: [], followUps: [], staleApplied: [] })).toBe(false);
    expect(
      decideDigestDelivery({ emailsEnabled: false, alreadySentToday: false, resendConfigured: true })
    ).toEqual({ send: false, reason: "emails_disabled" });
    expect(
      decideDigestDelivery({ emailsEnabled: true, alreadySentToday: true, resendConfigured: true })
    ).toEqual({ send: false, reason: "already_sent_today" });
    expect(
      decideDigestDelivery({ emailsEnabled: true, alreadySentToday: false, resendConfigured: false })
    ).toEqual({ send: false, reason: "resend_not_configured" });
    expect(
      decideDigestDelivery({ emailsEnabled: true, alreadySentToday: false, resendConfigured: true })
    ).toEqual({ send: true });
    expect(digestSubject({ jobs: 1, reminders: 2 })).toBe("Morning digest: 1 new match, 2 reminders");
  });
});
