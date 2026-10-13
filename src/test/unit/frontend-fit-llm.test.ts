import { afterEach, describe, expect, it } from "vitest";
import { scoreFrontendFit } from "@/modules/matching/frontend-fit";
import { maybeEnhanceFrontendFit } from "@/modules/matching/frontend-fit-llm";

describe("maybeEnhanceFrontendFit", () => {
  const previous = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });

  it("keeps the deterministic score when OpenAI is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const job = {
      title: "Senior Frontend Engineer",
      description: "React, TypeScript, and Next.js in Canada.",
    };
    const result = await maybeEnhanceFrontendFit(job);
    expect(result.enhanced).toBe(false);
    expect(result.note).toBeNull();
    expect(result.score).toBe(scoreFrontendFit(job).score);
    expect(result.reasons).toEqual(scoreFrontendFit(job).reasons);
  });
});
