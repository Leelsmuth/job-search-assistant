import { describe, expect, it, vi } from "vitest";
import { fetchApplicationForm, resolveApplyTarget, safeApplyUrl } from "@/modules/apply/fetch-form";
import { parseAshbyQuestions, parseGreenhouseQuestions, parseLeverQuestions } from "@/modules/apply/questions";
import type { ApplyTarget } from "@/modules/apply/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("safeApplyUrl", () => {
  it("allows http(s) links and drops other protocols", () => {
    expect(safeApplyUrl("https://boards.greenhouse.io/acme/jobs/111")).toBe(
      "https://boards.greenhouse.io/acme/jobs/111"
    );
    expect(safeApplyUrl("javascript:alert(1)")).toBeNull();
    expect(safeApplyUrl("not a url")).toBeNull();
  });
});

describe("resolveApplyTarget", () => {
  it("reads Greenhouse, Lever, Ashby, and Workday targets from the job URL", () => {
    expect(
      resolveApplyTarget({
        jobUrl: "https://boards.greenhouse.io/acme/jobs/111",
        sourceUrl: null,
        sourceProvider: null,
        sourceJobId: null,
      })
    ).toMatchObject({ provider: "greenhouse", boardSlug: "acme", sourceJobId: "111" });

    expect(
      resolveApplyTarget({
        jobUrl: "https://jobs.lever.co/acme/01234567-89ab-cdef-0123-456789abcdef",
        sourceUrl: null,
        sourceProvider: "lever",
        sourceJobId: null,
      })
    ).toMatchObject({
      provider: "lever",
      boardSlug: "acme",
      sourceJobId: "01234567-89ab-cdef-0123-456789abcdef",
    });

    expect(
      resolveApplyTarget({
        jobUrl: "https://jobs.ashbyhq.com/acme/01234567-89ab-cdef-0123-456789abcdef",
        sourceUrl: null,
        sourceProvider: null,
        sourceJobId: null,
      }).provider
    ).toBe("ashby");

    expect(
      resolveApplyTarget({
        jobUrl: "https://acme.wd1.myworkdayjobs.com/External/job/Toronto/Engineer_R123",
        sourceUrl: null,
        sourceProvider: null,
        sourceJobId: null,
      }).provider
    ).toBe("workday");
  });
});

describe("application form parsers", () => {
  it("parses Greenhouse questions, files, and demographic prompts", () => {
    const questions = parseGreenhouseQuestions({
      absolute_url: "https://boards.greenhouse.io/acme/jobs/111",
      questions: [
        { required: true, label: "First Name", fields: [{ name: "first_name", type: "input_text" }] },
        { required: true, label: "Resume", fields: [{ name: "resume", type: "input_file" }] },
      ],
      demographic_questions: {
        questions: [
          {
            label: "Gender",
            required: false,
            answer_options: [{ label: "Decline to self-identify" }, { label: "Woman" }],
          },
        ],
      },
    });
    expect(questions.map((item) => item.label)).toEqual(["First Name", "Resume", "Gender"]);
    expect(questions[1]?.type).toBe("file");
    expect(questions[2]?.options).toContain("Decline to self-identify");
  });

  it("keeps Lever standard fields and custom questions", () => {
    const parsed = parseLeverQuestions({
      applyUrl: "https://jobs.lever.co/acme/abc/apply",
      customQuestions: [
        { id: "q1", text: "Why this team?", required: true, type: "textarea" },
      ],
    });
    expect(parsed.customCount).toBe(1);
    expect(parsed.questions.some((item) => item.label === "Email")).toBe(true);
    expect(parsed.questions.some((item) => item.label === "Why this team?")).toBe(true);
  });

  it("parses an Ashby application form", () => {
    const questions = parseAshbyQuestions({
      applicationForm: {
        fields: [
          {
            isRequired: true,
            field: { id: "name", path: "_systemfield_name", type: "String", title: "Name" },
          },
          {
            isRequired: false,
            field: {
              id: "why",
              path: "why",
              type: "LongText",
              title: "Why Ashby?",
            },
          },
        ],
      },
    });
    expect(questions.map((item) => [item.label, item.type])).toEqual([
      ["Name", "short_text"],
      ["Why Ashby?", "long_text"],
    ]);
  });
});

describe("fetchApplicationForm", () => {
  const greenhouse: ApplyTarget = {
    provider: "greenhouse",
    boardSlug: "acme",
    sourceJobId: "111",
    jobUrl: "https://boards.greenhouse.io/acme/jobs/111",
  };

  it("requests Greenhouse questions=true", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs/111?questions=true");
      return jsonResponse({
        absolute_url: "https://boards.greenhouse.io/acme/jobs/111",
        questions: [
          { required: true, label: "First Name", fields: [{ name: "first_name", type: "input_text" }] },
        ],
      });
    });
    const result = await fetchApplicationForm(greenhouse, fetchImpl);
    expect(result.source).toBe("api");
    expect(result.questions[0]?.label).toBe("First Name");
    expect(result.applyUrl).toBe("https://boards.greenhouse.io/acme/jobs/111");
  });

  it("uses Lever custom questions when the posting includes them", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        hostedUrl: "https://jobs.lever.co/acme/01234567-89ab-cdef-0123-456789abcdef",
        customQuestions: [{ id: "q1", text: "Tell us about a project", type: "textarea", required: false }],
      })
    );
    const result = await fetchApplicationForm(
      {
        provider: "lever",
        boardSlug: "acme",
        sourceJobId: "01234567-89ab-cdef-0123-456789abcdef",
        jobUrl: null,
      },
      fetchImpl
    );
    expect(result.source).toBe("api");
    expect(result.questions.some((item) => item.label === "Tell us about a project")).toBe(true);
    expect(result.note).toBeNull();
  });

  it("falls back to standard Lever fields when custom questions are absent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hostedUrl: "https://jobs.lever.co/acme/posting" }));
    const result = await fetchApplicationForm(
      {
        provider: "lever",
        boardSlug: "acme",
        sourceJobId: "01234567-89ab-cdef-0123-456789abcdef",
        jobUrl: "https://jobs.lever.co/acme/01234567-89ab-cdef-0123-456789abcdef",
      },
      fetchImpl
    );
    expect(result.source).toBe("api");
    expect(result.questions.some((item) => item.atsField === "urls[LinkedIn]")).toBe(true);
    expect(result.note).toMatch(/did not publish custom questions/i);
  });

  it("reads an Ashby form from the posting API and does not call GraphQL when it is present", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("api.ashbyhq.com/posting-api/job-board/acme/");
      return jsonResponse({
        applicationForm: {
          fields: [{ isRequired: true, field: { title: "Name", type: "String", path: "name" } }],
        },
      });
    });
    const result = await fetchApplicationForm(
      {
        provider: "ashby",
        boardSlug: "acme",
        sourceJobId: "01234567-89ab-cdef-0123-456789abcdef",
        jobUrl: "https://jobs.ashbyhq.com/acme/01234567-89ab-cdef-0123-456789abcdef",
      },
      fetchImpl
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("api");
    expect(result.questions[0]?.label).toBe("Name");
  });

  it("uses the Ashby GraphQL form when the posting payload has none", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("non-user-graphql")) {
        return jsonResponse({
          data: {
            jobPosting: {
              applicationForm: {
                fields: [{ isRequired: true, field: { title: "Email", type: "Email", path: "email" } }],
              },
            },
          },
        });
      }
      return jsonResponse({ id: "01234567-89ab-cdef-0123-456789abcdef", title: "Engineer" });
    });
    const result = await fetchApplicationForm(
      {
        provider: "ashby",
        boardSlug: "acme",
        sourceJobId: "01234567-89ab-cdef-0123-456789abcdef",
        jobUrl: null,
      },
      fetchImpl
    );
    expect(result.questions[0]?.label).toBe("Email");
    expect(result.source).toBe("api");
  });

  it("uses a standard Workday set without calling HTTP", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchApplicationForm(
      {
        provider: "workday",
        boardSlug: null,
        sourceJobId: null,
        jobUrl: "https://acme.wd1.myworkdayjobs.com/External/job/Toronto/Engineer_R123",
      },
      fetchImpl
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.source).toBe("standard");
    expect(result.note).toMatch(/Workday/i);
    expect(result.questions.some((item) => item.label === "Legal name")).toBe(true);
    expect(result.questions.some((item) => /sponsorship/i.test(item.label))).toBe(true);
  });

  it("does not request a form when the board slug is not a single path segment", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchApplicationForm(
      {
        provider: "greenhouse",
        boardSlug: "acme.evil.com/boards",
        sourceJobId: "111",
        jobUrl: "https://boards.greenhouse.io/acme/jobs/111",
      },
      fetchImpl
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.source).toBe("standard");
    expect(result.error).toMatch(/Missing Greenhouse/);
  });
});
