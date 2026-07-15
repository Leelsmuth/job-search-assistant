import { describe, it, expect } from "vitest";
import {
  dedupeCandidates,
  isPlausibleBoardSlug,
  auditRegistry,
} from "@/modules/discovery/registry/merge";
import type { DiscoveredCompanyCandidate } from "@/modules/discovery/registry/discovery-sources/types";

describe("isPlausibleBoardSlug", () => {
  it("rejects numeric-only and test slugs", () => {
    expect(isPlausibleBoardSlug("123456")).toBe(false);
    expect(isPlausibleBoardSlug("demo")).toBe(false);
    expect(isPlausibleBoardSlug("stripe")).toBe(true);
  });
});

describe("dedupeCandidates", () => {
  it("dedupes by provider + boardSlug", () => {
    const candidates: DiscoveredCompanyCandidate[] = [
      { atsProvider: "greenhouse", boardSlug: "stripe", discoverySource: "a" },
      { atsProvider: "greenhouse", boardSlug: "Stripe", discoverySource: "b" },
      { atsProvider: "lever", boardSlug: "stripe", discoverySource: "c" },
    ];
    expect(dedupeCandidates(candidates)).toHaveLength(2);
  });
});

describe("auditRegistry", () => {
  it("flags board duplicates", () => {
    const report = auditRegistry([
      {
        id: "a",
        companyName: "Palantir",
        companySlug: "palantir",
        atsProvider: "lever",
        boardSlug: "palantir",
        boardUrl: "https://jobs.lever.co/palantir",
        industries: [],
        enabled: true,
        verificationStatus: "verified",
      },
      {
        id: "b",
        companyName: "Palantir",
        companySlug: "palantir-2",
        atsProvider: "lever",
        boardSlug: "palantir",
        boardUrl: "https://jobs.lever.co/palantir",
        industries: [],
        enabled: true,
        verificationStatus: "verified",
      },
    ]);
    expect(report.boardDuplicates).toHaveLength(1);
  });
});
