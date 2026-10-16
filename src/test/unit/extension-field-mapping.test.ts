import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultApplicationProfile } from "@/modules/apply/profile";
import type { ApplicationProfile } from "@/modules/apply/types";
import { extractFieldsFromHtml } from "@/modules/extension/html-fields";
import { planPageFill } from "@/modules/extension/map-page";
import { extractJobPosting } from "@/modules/extension/posting";
import type { FillInstruction } from "@/modules/extension/page-types";
import { detectPageProvider } from "@/modules/extension/urls";

const profile: ApplicationProfile = {
  ...defaultApplicationProfile(),
  legalName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "416-555-0100",
  city: "Toronto",
  province: "ON",
  linkedinUrl: "https://www.linkedin.com/in/ada",
  githubUrl: "https://github.com/ada",
  portfolioUrl: "https://ada.example",
  workAuthorization: "Canadian citizen",
  requiresSponsorship: false,
  willingToRelocate: false,
  earliestStartDate: "2026-11-01",
  salaryExpectationCad: 140000,
  eeoGender: "Prefer not to say",
};

const documents = {
  resume: true,
  coverLetter: true,
  coverLetterBody: "I build accessible interfaces.",
};

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "src/test/fixtures/extension", name), "utf8");
}

function plan(name: string, pageUrl: string, prepared: Array<{ label: string; answer: string }> = []) {
  const snapshot = extractFieldsFromHtml(fixture(name));
  return planPageFill({
    provider: detectPageProvider(pageUrl),
    headings: snapshot.headings,
    buttons: snapshot.buttons,
    fields: snapshot.fields,
    profile,
    preparedAnswers: prepared,
    documents,
  });
}

function value(fills: FillInstruction[], key: string): string | undefined {
  return fills.find((fill) => fill.key === key)?.value;
}

function mode(fills: FillInstruction[], key: string): string | undefined {
  return fills.find((fill) => fill.key === key)?.mode;
}

describe("extension field mapping", () => {
  it("maps a Greenhouse application and leaves submit alone", () => {
    const result = plan(
      "greenhouse-application.html",
      "https://boards.greenhouse.io/acme/jobs/123",
      [{ label: "Why do you want this role?", answer: "I have shipped design systems." }]
    );

    expect(value(result.fills, "first_name")).toBe("Ada");
    expect(value(result.fills, "last_name")).toBe("Lovelace");
    expect(value(result.fills, "email")).toBe("ada@example.com");
    expect(value(result.fills, "phone")).toBe("416-555-0100");
    expect(value(result.fills, "job_application_location")).toBe("Toronto, ON");
    expect(value(result.fills, "job_application_linkedin")).toBe("https://www.linkedin.com/in/ada");
    expect(value(result.fills, "job_application_github")).toBe("https://github.com/ada");
    expect(value(result.fills, "job_application_website")).toBe("https://ada.example");
    expect(value(result.fills, "work_authorization")).toBe("yes");
    expect(value(result.fills, "sponsorship")).toBe("no");
    expect(value(result.fills, "salary")).toBe("140000 CAD");
    expect(value(result.fills, "start_date")).toBe("2026-11-01");
    expect(value(result.fills, "why_role")).toBe("I have shipped design systems.");
    expect(value(result.fills, "cover_letter_text")).toBe("I build accessible interfaces.");
    expect(mode(result.fills, "resume")).toBe("file");
    expect(mode(result.fills, "cover_letter")).toBe("file");
    expect(result.fills.some((fill) => fill.key === "gender")).toBe(false);
    expect(result.attention.map((item) => item.key)).toContain("employee_id");
    expect(result.attention.some((item) => /gender/i.test(item.label))).toBe(false);
    expect(result.ignoredControls).toContain("Submit application");
    expect(result.fills.some((fill) => /submit/i.test(fill.label))).toBe(false);
    expect(result.reviewStep).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/click|submit\(/i);
  });

  it("fills Greenhouse voluntary questions only from a saved answer", () => {
    const snapshot = extractFieldsFromHtml(fixture("greenhouse-application.html"));
    const result = planPageFill({
      provider: "greenhouse",
      headings: snapshot.headings,
      buttons: snapshot.buttons,
      fields: snapshot.fields,
      profile: {
        ...profile,
        savedAnswers: [{ id: "gender", question: "Gender", answer: "Woman" }],
      },
      preparedAnswers: [],
      documents,
    });
    expect(value(result.fills, "gender")).toBe("woman");
    expect(result.fills.some((fill) => fill.key === "why_role")).toBe(false);
    expect(result.attention.map((item) => item.key)).toContain("why_role");
  });

  it("maps a Lever application", () => {
    const result = plan("lever-application.html", "https://jobs.lever.co/acme/11111111-1111-1111-1111-111111111111");
    expect(value(result.fills, "name")).toBe("Ada Lovelace");
    expect(value(result.fills, "email")).toBe("ada@example.com");
    expect(value(result.fills, "phone")).toBe("416-555-0100");
    expect(value(result.fills, "linkedin")).toBe("https://www.linkedin.com/in/ada");
    expect(value(result.fills, "github")).toBe("https://github.com/ada");
    expect(value(result.fills, "portfolio")).toBe("https://ada.example");
    expect(value(result.fills, "auth")).toBe("yes");
    expect(mode(result.fills, "auth")).toBe("choice");
    expect(mode(result.fills, "resume")).toBe("file");
    expect(result.fills.some((fill) => fill.key === "comments")).toBe(false);
    expect(result.ignoredControls).toContain("Submit application");
    expect(result.reviewStep).toBe(false);
  });

  it("maps an Ashby application", () => {
    const result = plan("ashby-application.html", "https://jobs.ashbyhq.com/acme/22222222-2222-2222-2222-222222222222");
    expect(value(result.fills, "_systemfield_name")).toBe("Ada Lovelace");
    expect(value(result.fills, "_systemfield_email")).toBe("ada@example.com");
    expect(value(result.fills, "_systemfield_phone")).toBe("416-555-0100");
    expect(value(result.fills, "_systemfield_location")).toBe("Toronto, ON");
    expect(value(result.fills, "linkedin")).toBe("https://www.linkedin.com/in/ada");
    expect(value(result.fills, "website")).toBe("https://ada.example");
    expect(value(result.fills, "authorized")).toBe("yes");
    expect(value(result.fills, "sponsor")).toBe("no");
    expect(mode(result.fills, "resume")).toBe("file");
    expect(result.ignoredControls).toContain("Submit application");
  });

  it("maps a Workday information page without advancing", () => {
    const result = plan(
      "workday-information.html",
      "https://acme.wd1.myworkdayjobs.com/en-US/site/job/Toronto/Engineer_R-12345"
    );
    expect(result.reviewStep).toBe(false);
    expect(value(result.fills, "legalNameSection_firstName")).toBe("Ada");
    expect(value(result.fills, "legalNameSection_lastName")).toBe("Lovelace");
    expect(value(result.fills, "email")).toBe("ada@example.com");
    expect(value(result.fills, "phone")).toBe("416-555-0100");
    expect(value(result.fills, "city")).toBe("Toronto");
    expect(value(result.fills, "region")).toBe("ON");
    expect(result.ignoredControls).toContain("Save and Continue");
    expect(result.fills).not.toEqual(expect.arrayContaining([expect.objectContaining({ mode: "click" })]));
  });

  it("maps only the current Workday experience page", () => {
    const result = plan(
      "workday-experience.html",
      "https://acme.wd1.myworkdayjobs.com/site/job/Toronto/Engineer_R-12345/apply"
    );
    expect(mode(result.fills, "resume")).toBe("file");
    expect(result.fills.some((fill) => fill.key === "years")).toBe(false);
    expect(result.attention.map((item) => item.key)).toContain("years");
    expect(result.ignoredControls).toContain("Save and Continue");
    expect(result.reviewStep).toBe(false);
  });

  it("does not fill or advance a Workday review step", () => {
    const result = plan(
      "workday-review.html",
      "https://acme.wd1.myworkdayjobs.com/site/job/Toronto/Engineer_R-12345/apply"
    );
    expect(result.reviewStep).toBe(true);
    expect(result.fills).toEqual([]);
    expect(result.reviewNote).toMatch(/will not continue or submit/i);
    expect(result.ignoredControls).toContain("Submit");
  });
});

describe("job posting capture", () => {
  it("reads a LinkedIn job posting", () => {
    const posting = extractJobPosting(
      fixture("linkedin-job.html"),
      "https://www.linkedin.com/jobs/view/123?utm_source=share"
    );
    expect(posting.title).toBe("Senior Frontend Engineer");
    expect(posting.company).toBe("Northwind Labs");
    expect(posting.location).toBe("Toronto, ON");
    expect(posting.description).toMatch(/accessible React/);
    expect(posting.url).toBe("https://www.linkedin.com/jobs/view/123");
    expect(posting.workplaceType).toBe("hybrid");
  });

  it("reads an Indeed job posting", () => {
    const posting = extractJobPosting(fixture("indeed-job.html"), "https://ca.indeed.com/viewjob?jk=abc");
    expect(posting.title).toBe("Frontend Developer");
    expect(posting.company).toBe("Example Studio");
    expect(posting.location).toBe("Canada");
    expect(posting.description).toMatch(/design systems/);
    expect(posting.workplaceType).toBe("remote");
  });
});
