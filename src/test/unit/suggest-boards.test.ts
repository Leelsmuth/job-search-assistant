import { describe, it, expect } from "vitest";
import { suggestBoardsForProfile } from "@/modules/discovery/suggest-boards";
import type { CompanyJobSource } from "../../../data/company-sources.schema";

const catalog: CompanyJobSource[] = [
  {
    id: "stripe",
    companyName: "Stripe",
    companySlug: "stripe",
    atsProvider: "greenhouse",
    boardSlug: "stripe",
    boardUrl: "https://boards.greenhouse.io/stripe",
    industries: ["fintech"],
    enabled: true,
    verificationStatus: "verified",
    observedSignals: {
      hasCanadaJobs: true,
      hasRemoteCanadaJobs: true,
      hasFrontendJobs: true,
      hasReactJobs: true,
      hasTypeScriptJobs: true,
      hasRemoteJobs: true,
      frontendJobCount: 5,
      reactJobCount: 3,
      typescriptJobCount: 4,
      canadaJobCount: 2,
      remoteCanadaJobCount: 1,
      analyzedAt: "2026-01-01T00:00:00.000Z",
    },
    lastJobCount: 50,
  },
  {
    id: "sales-co",
    companyName: "Sales Co",
    companySlug: "sales-co",
    atsProvider: "lever",
    boardSlug: "sales-co",
    boardUrl: "https://jobs.lever.co/sales-co",
    industries: [],
    enabled: true,
    verificationStatus: "verified",
    lastJobCount: 5,
  },
];

describe("suggestBoardsForProfile", () => {
  it("ranks boards with frontend and remote CA signals", () => {
    const profile = {
      targetTitles: ["Frontend Engineer"],
      remotePreference: "remote",
      location: "Toronto, Canada",
      preferredLocations: ["Canada"],
    } as Parameters<typeof suggestBoardsForProfile>[1];

    const suggestions = suggestBoardsForProfile(catalog, profile, new Set(), 5);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe("stripe");
  });

  it("excludes already followed boards", () => {
    const profile = {
      targetTitles: [],
      remotePreference: "remote",
      location: "Canada",
      preferredLocations: [],
    } as Parameters<typeof suggestBoardsForProfile>[1];

    const suggestions = suggestBoardsForProfile(
      catalog,
      profile,
      new Set(["https://boards.greenhouse.io/stripe"]),
      5
    );
    expect(suggestions.find((s) => s.id === "stripe")).toBeUndefined();
  });
});
