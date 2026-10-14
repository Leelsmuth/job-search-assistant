import { afterEach, describe, expect, it, vi } from "vitest";
import { renderDigestEmail, sendDigestEmail } from "@/modules/digest/email";
import type { DigestPayload } from "@/modules/digest/types";

const payload: DigestPayload = {
  generatedAt: "2026-10-14T12:00:00.000Z",
  windowStart: "2026-10-13T12:00:00.000Z",
  windowEnd: "2026-10-14T12:00:00.000Z",
  jobs: [
    {
      id: "job-1",
      title: "Senior Frontend <Engineer>",
      companyName: "Acme & Co",
      locationLabel: "Remote - Canada · Remote-Canada",
      score: 88,
      reason: "Title is a frontend role",
      href: "/jobs/job-1",
      postingUrl: "https://boards.example.com/jobs/1",
    },
  ],
  followUps: [
    {
      id: "app-1",
      jobId: "job-1",
      title: "UI Engineer",
      companyName: "North",
      followUpDate: "2026-10-14",
      overdue: false,
      href: "/applications/app-1",
    },
  ],
  staleApplied: [
    {
      id: "app-2",
      jobId: "job-2",
      title: "React Developer",
      companyName: "South",
      dateApplied: "2026-09-01T12:00:00.000Z",
      daysQuiet: 43,
      href: "/applications/app-2",
    },
  ],
};

describe("digest email", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.DIGEST_FROM_EMAIL;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.DIGEST_FROM_EMAIL;
    else process.env.DIGEST_FROM_EMAIL = originalFrom;
  });

  it("renders plain text and escaped html with job and tracker links", () => {
    const message = renderDigestEmail(payload, "https://jobs.example.com");
    expect(message.subject).toContain("1 new match");
    expect(message.text).toContain("https://jobs.example.com/jobs/job-1");
    expect(message.text).toContain("https://jobs.example.com/applications");
    expect(message.text).toContain("https://jobs.example.com/applications/app-1");
    expect(message.html).toContain("https://jobs.example.com/jobs/job-1");
    expect(message.html).toContain("Senior Frontend &lt;Engineer&gt;");
    expect(message.html).toContain("Acme &amp; Co");
    expect(message.html).not.toContain("<Engineer>");
  });

  it("skips sending and logs when RESEND_API_KEY is unset", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchImpl = vi.fn();
    delete process.env.RESEND_API_KEY;
    process.env.DIGEST_FROM_EMAIL = "Job Search <onboarding@resend.dev>";

    const result = await sendDigestEmail({
      to: "owner@example.com",
      subject: "Morning digest",
      html: "<p>Hi</p>",
      text: "Hi",
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, reason: "resend_not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("RESEND_API_KEY"));
    info.mockRestore();
  });

  it("posts html and text to Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.DIGEST_FROM_EMAIL = "Job Search <onboarding@resend.dev>";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await sendDigestEmail({
      to: "owner@example.com",
      subject: "Morning digest",
      html: "<p>Hi</p>",
      text: "Hi",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
      })
    );
    const calls = fetchImpl.mock.calls as unknown as Array<[string, { body?: string }]>;
    const body = JSON.parse(String(calls[0]?.[1].body));
    expect(body.to).toEqual(["owner@example.com"]);
    expect(body.from).toBe("Job Search <onboarding@resend.dev>");
    expect(body.text).toBe("Hi");
    expect(body.html).toBe("<p>Hi</p>");
  });
});
