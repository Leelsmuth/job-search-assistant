import { describe, it, expect } from "vitest";
import {
  validateDraftAnswerResponse,
  detectUnsupportedClaims,
} from "@/modules/ai/schemas";

describe("draft answer validation", () => {
  const evidence = [
    { id: "11111111-1111-1111-1111-111111111111", text: "Built React dashboards with TypeScript" },
  ];
  const validIds = new Set(evidence.map((e) => e.id));
  const evidenceById = new Map(evidence.map((e) => [e.id, e.text]));

  it("filters invalid evidence IDs", () => {
    const result = validateDraftAnswerResponse(
      {
        answer: "I have React experience building dashboards.",
        evidenceIds: [
          "11111111-1111-1111-1111-111111111111",
          "99999999-9999-9999-9999-999999999999",
        ],
        unsupportedClaims: [],
      },
      validIds,
      evidenceById,
      "React role"
    );
    expect(result.evidenceIds).toHaveLength(1);
  });

  it("detects tech mentioned without evidence support", () => {
    const claims = detectUnsupportedClaims(
      "I have extensive Kubernetes experience in production.",
      ["Built React dashboards with TypeScript"],
      "We need Kubernetes and React"
    );
    expect(claims.some((c) => c.toLowerCase().includes("kubernetes"))).toBe(true);
  });
});
