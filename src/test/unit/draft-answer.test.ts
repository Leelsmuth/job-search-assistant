import { describe, it, expect } from "vitest";
import { draftApplicationAnswer } from "@/modules/ai/client";

describe("draftApplicationAnswer heuristic fallback", () => {
  it("generates a useful draft without OpenAI", async () => {
    const result = await draftApplicationAnswer(
      "Why are you interested in this role?",
      "Frontend engineer with React and TypeScript experience.",
      "We need React, TypeScript, and GraphQL experience for this senior role.",
      [
        {
          id: "e1",
          evidenceText: "Migrated complex workflows from Ember to React and TypeScript.",
        },
        {
          id: "e2",
          evidenceText: "Built Playwright test coverage for critical user flows.",
        },
      ]
    );

    expect(result.answer).not.toContain("Unable to generate draft");
    expect(result.answer.toLowerCase()).toMatch(/react|typescript|interested/);
    expect(result.answer).toContain("[Draft — review and edit before submitting]");
    expect(result.evidenceIds.length).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.unsupportedClaims)).toBe(true);
  });
});
