import { describe, it, expect } from "vitest";
import {
  validateTailoringSuggestions,
  hasSubstantialOverlap,
} from "@/modules/ai/schemas";

describe("tailoring suggestion validation", () => {
  const bulletId = "11111111-1111-1111-1111-111111111111";
  const evidenceId = "22222222-2222-2222-2222-222222222222";
  const bulletText = "Built React dashboards with TypeScript and GraphQL";

  it("rejects suggestions with unknown bulletId", () => {
    const result = validateTailoringSuggestions(
      [
        {
          bulletId: "99999999-9999-9999-9999-999999999999",
          originalText: bulletText,
          suggestedText: "Led React dashboards using TypeScript and GraphQL",
        },
      ],
      new Set([bulletId]),
      new Set([evidenceId]),
      new Map([[bulletId, bulletText]])
    );
    expect(result).toHaveLength(0);
  });

  it("rejects suggestions without substantial overlap", () => {
    const result = validateTailoringSuggestions(
      [
        {
          bulletId,
          originalText: bulletText,
          suggestedText: "Managed Kubernetes clusters in production",
          suggestionType: "rewrite",
        },
      ],
      new Set([bulletId]),
      new Set([evidenceId]),
      new Map([[bulletId, bulletText]])
    );
    // Rewrites may diverge from the source bullet when bulletId is valid.
    expect(result).toHaveLength(1);
    expect(result[0].originalText).toBe(bulletText);
  });

  it("rejects emphasize suggestions identical to the source bullet", () => {
    const result = validateTailoringSuggestions(
      [
        {
          bulletId,
          originalText: bulletText,
          suggestedText: bulletText,
          suggestionType: "emphasize",
        },
      ],
      new Set([bulletId]),
      new Set([evidenceId]),
      new Map([[bulletId, bulletText]])
    );
    expect(result).toHaveLength(0);
  });

  it("accepts linked suggestions with overlap", () => {
    const result = validateTailoringSuggestions(
      [
        {
          bulletId,
          originalText: bulletText,
          suggestedText: "Built React dashboards with TypeScript, GraphQL, and testing",
          evidenceId,
        },
      ],
      new Set([bulletId]),
      new Set([evidenceId]),
      new Map([[bulletId, bulletText]])
    );
    expect(result).toHaveLength(1);
    expect(result[0].evidenceId).toBe(evidenceId);
  });

  it("detects substantial token overlap", () => {
    expect(hasSubstantialOverlap("React TypeScript GraphQL", "React TypeScript testing")).toBe(
      true
    );
    expect(hasSubstantialOverlap("React TypeScript", "Kubernetes Go Rust")).toBe(false);
  });
});
