import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "src/modules/ai/client.ts",
  "src/modules/matching/frontend-fit-llm.ts",
  "src/modules/resumes/parse/resume-structure-parser.ts",
  "src/modules/documents/llm.ts",
];

describe("OpenAI model configuration", () => {
  it("does not hardcode the chat model at call sites", () => {
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("getOpenAiModel(");
      expect(source, file).not.toContain('model: "gpt-4o-mini"');
    }
  });
});
