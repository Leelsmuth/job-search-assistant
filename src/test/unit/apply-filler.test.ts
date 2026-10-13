import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bookmarkletHref, bookmarkletSource, planFieldFills } from "@/modules/apply/filler";

describe("assisted apply filler", () => {
  it("plans Greenhouse and select fields and skips files and submit controls", () => {
    const plans = planFieldFills(
      [
        {
          name: "job_application[first_name]",
          id: "first",
          tag: "input",
          type: "text",
          label: "First Name",
          options: [],
        },
        {
          name: "job_application[email]",
          id: "email",
          tag: "input",
          type: "email",
          label: "Email",
          options: [],
        },
        {
          name: "resume",
          id: "resume",
          tag: "input",
          type: "file",
          label: "Resume",
          options: [],
        },
        {
          name: "submit",
          id: "submit",
          tag: "input",
          type: "submit",
          label: "Submit Application",
          options: [],
        },
        {
          name: "gender",
          id: "gender",
          tag: "select",
          type: "select",
          label: "Gender",
          options: [{ value: "decline", text: "Decline to self-identify" }],
        },
      ],
      [
        { label: "First Name", answer: "Ada", atsField: "first_name" },
        { label: "Email", answer: "ada@example.com", atsField: "email" },
        { label: "Resume", answer: "resume.pdf" },
        { label: "Gender", answer: "Decline to self-identify" },
      ]
    );

    expect(plans).toEqual([
      { fieldName: "job_application[first_name]", fieldId: "first", value: "Ada" },
      { fieldName: "job_application[email]", fieldId: "email", value: "ada@example.com" },
      { fieldName: "gender", fieldId: "gender", value: "decline" },
    ]);
  });

  it("keeps the bookmarklet from submitting or uploading files", () => {
    const source = bookmarkletSource();
    const href = bookmarkletHref();
    expect(href.startsWith("javascript:")).toBe(true);
    expect(source).toContain("does not submit");
    expect(source).toContain("file:1");
    expect(source).not.toContain(".submit");
    expect(source).not.toContain("click(");
    expect(source).not.toMatch(/innerHTML/);
  });
});

describe("assisted apply database access", () => {
  it("does not run assisted-apply database work in parallel", () => {
    const source = readFileSync(resolve(process.cwd(), "src/server/actions/apply-actions.ts"), "utf8");
    expect(source).not.toContain("Promise.all");
    expect(source).toContain("withUserDb");
  });
});
