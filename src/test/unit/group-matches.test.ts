import { describe, it, expect } from "vitest";
import { groupRequirementMatches } from "@/modules/matching/group-matches";

describe("groupRequirementMatches", () => {
  const matches = [
    {
      id: "1",
      matchStatus: "confirmed",
      explanation: "React match",
      requirement: { text: "React" },
    },
    {
      id: "2",
      matchStatus: "transferable",
      explanation: "GraphQL adjacent",
      requirement: { text: "GraphQL" },
    },
    {
      id: "3",
      matchStatus: "gap",
      explanation: "Missing K8s",
      requirement: { text: "Kubernetes" },
    },
    {
      id: "4",
      matchStatus: "missing_evidence",
      explanation: "No AWS proof",
      requirement: { text: "AWS" },
    },
    {
      id: "5",
      matchStatus: "blocked",
      explanation: "Onsite only",
      requirement: { text: "Onsite US" },
    },
  ];

  it("groups matches by status bucket", () => {
    const grouped = groupRequirementMatches(matches);
    expect(grouped.strong).toHaveLength(1);
    expect(grouped.partial).toHaveLength(1);
    expect(grouped.gaps).toHaveLength(2);
    expect(grouped.blockers).toHaveLength(1);
  });
});
