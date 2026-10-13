import { describe, expect, it } from "vitest";
import { mapFormQuestions, splitLegalName } from "@/modules/apply/map-questions";
import { defaultApplicationProfile } from "@/modules/apply/profile";
import type { ApplicationProfile, FormQuestion } from "@/modules/apply/types";

function profile(): ApplicationProfile {
  return {
    ...defaultApplicationProfile(),
    legalName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "416-555-0100",
    city: "Toronto",
    province: "ON",
    linkedinUrl: "https://linkedin.com/in/ada",
    githubUrl: "https://github.com/ada",
    portfolioUrl: "https://ada.dev",
    workAuthorization: "Canadian citizen",
    requiresSponsorship: false,
    willingToRelocate: false,
    earliestStartDate: "2026-11-01",
    salaryExpectationCad: 160000,
    pronouns: "she/her",
    howDidYouHear: "LinkedIn",
    savedAnswers: [
      {
        id: "looking",
        question: "What are you looking for in a new role?",
        answer: "Ownership of frontend systems.",
      },
    ],
  };
}

function question(partial: Partial<FormQuestion> & Pick<FormQuestion, "id" | "label">): FormQuestion {
  return { type: "short_text", required: false, ...partial };
}

describe("application question mapping", () => {
  it("splits a legal name", () => {
    expect(splitLegalName("Ada Lovelace")).toEqual({ first: "Ada", last: "Lovelace" });
    expect(splitLegalName("Ada")).toEqual({ first: "Ada", last: "" });
  });

  it("maps profile fields, yes/no prompts, saved answers, files, and open-ended drafts", () => {
    const mapped = mapFormQuestions({
      profile: profile(),
      coverLetterBody: "I am excited to apply.",
      questions: [
        question({ id: "first", label: "First Name", atsField: "first_name" }),
        question({ id: "last", label: "Last Name", atsField: "last_name" }),
        question({ id: "email", label: "Email", type: "email" }),
        question({
          id: "auth",
          label: "Are you legally authorized to work in Canada?",
          type: "select",
          options: ["Yes", "No"],
        }),
        question({
          id: "sponsor",
          label: "Will you now or in the future require sponsorship?",
          type: "select",
          options: ["Yes", "No"],
        }),
        question({
          id: "gender",
          label: "Gender",
          type: "select",
          options: ["Decline to self-identify", "Woman", "Man"],
        }),
        question({ id: "salary", label: "Salary expectation", type: "number" }),
        question({ id: "start", label: "Earliest start date", type: "date" }),
        question({ id: "why", label: "Why are you interested in this role?", type: "long_text" }),
        question({ id: "looking", label: "What are you looking for?", type: "long_text" }),
        question({ id: "resume", label: "Resume", type: "file", required: true }),
        question({ id: "letter", label: "Cover letter", type: "long_text" }),
      ],
    });

    const byId = new Map(mapped.map((item) => [item.questionId, item]));
    expect(byId.get("first")).toMatchObject({ answer: "Ada", valueSource: "profile" });
    expect(byId.get("last")).toMatchObject({ answer: "Lovelace", valueSource: "profile" });
    expect(byId.get("email")?.answer).toBe("ada@example.com");
    expect(byId.get("auth")?.answer).toBe("Yes");
    expect(byId.get("sponsor")?.answer).toBe("No");
    expect(byId.get("gender")?.answer).toBe("Decline to self-identify");
    expect(byId.get("salary")?.answer).toBe("160000");
    expect(byId.get("start")?.answer).toBe("2026-11-01");
    expect(byId.get("why")).toMatchObject({ kind: "open_ended", needsDraft: true, answer: "" });
    expect(byId.get("looking")).toMatchObject({
      kind: "saved",
      valueSource: "saved",
      answer: "Ownership of frontend systems.",
      needsDraft: false,
    });
    expect(byId.get("resume")).toMatchObject({ kind: "file", answer: "" });
    expect(byId.get("resume")?.note).toMatch(/attach it yourself/i);
    expect(byId.get("letter")).toMatchObject({
      kind: "cover_letter",
      answer: "I am excited to apply.",
    });
  });

  it("keeps an edited answer and a previous open-ended draft", () => {
    const mapped = mapFormQuestions({
      profile: profile(),
      coverLetterBody: null,
      existingAnswers: [
        {
          question: "Email",
          draftAnswer: "old@example.com",
          finalAnswer: "edited@example.com",
          evidenceIds: [],
          unsupportedClaims: [],
        },
        {
          question: "Why are you interested in this role?",
          draftAnswer: "Grounded draft",
          finalAnswer: null,
          evidenceIds: ["ev-1"],
          unsupportedClaims: ["Verify claim: \"invented a platform\""],
        },
      ],
      questions: [
        question({ id: "email", label: "Email", type: "email" }),
        question({ id: "why", label: "Why are you interested in this role?", type: "long_text" }),
      ],
    });

    expect(mapped[0]).toMatchObject({ answer: "edited@example.com", valueSource: "edited" });
    expect(mapped[1]).toMatchObject({
      answer: "Grounded draft",
      valueSource: "draft",
      needsDraft: false,
      evidenceIds: ["ev-1"],
    });
    expect(mapped[1]?.unsupportedClaims[0]).toMatch(/invented a platform/);
  });

  it("uses Canadian citizen and prefer-not-to-say defaults when the profile is empty", () => {
    const mapped = mapFormQuestions({
      profile: defaultApplicationProfile(),
      coverLetterBody: null,
      questions: [
        question({
          id: "auth",
          label: "Work authorization",
          type: "short_text",
        }),
        question({
          id: "sponsor",
          label: "Do you require visa sponsorship?",
          type: "boolean",
        }),
        question({ id: "gender", label: "Gender", type: "short_text" }),
      ],
    });
    expect(mapped[0]?.answer).toBe("Canadian citizen");
    expect(mapped[1]?.answer).toBe("No");
    expect(mapped[2]?.answer).toBe("Prefer not to say");
  });
});
