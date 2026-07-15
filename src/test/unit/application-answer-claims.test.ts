import { describe, it, expect } from "vitest";
import { detectUnsupportedClaims } from "@/modules/ai/schemas";

describe("manual save claim re-check", () => {
  it("flags tech mentioned without cited evidence on edited answers", () => {
    const claims = detectUnsupportedClaims(
      "I have led large Kubernetes deployments in production.",
      ["Built React dashboards with TypeScript"],
      "We need Kubernetes experience"
    );

    expect(claims.some((c) => c.toLowerCase().includes("kubernetes"))).toBe(true);
  });

  it("returns fewer claims when evidence supports the mention", () => {
    const claims = detectUnsupportedClaims(
      "I have built React dashboards in production.",
      ["Built React dashboards with TypeScript"],
      "We need React experience"
    );

    expect(claims.some((c) => c.toLowerCase().includes("react"))).toBe(false);
  });
});
