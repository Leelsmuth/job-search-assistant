import { describe, it, expect, vi, beforeEach } from "vitest";
import { requirementMatches, tailoringSuggestions, profileEvidence } from "@/db/schema";
import { wipeExtractedProfileData } from "@/modules/resumes/profile-wipe";

describe("wipeExtractedProfileData", () => {
  let requirementMatchesUpdated = false;
  let tailoringUpdated = false;
  let evidenceDeleted = false;

  const makeWhere = () => ({ where: vi.fn().mockResolvedValue(undefined) });

  beforeEach(() => {
    requirementMatchesUpdated = false;
    tailoringUpdated = false;
    evidenceDeleted = false;
  });

  it("detaches FK references before deleting profile evidence", async () => {
    const db = {
      query: {
        profileEvidence: {
          findMany: vi.fn().mockResolvedValue([{ id: "evidence-1" }]),
        },
        candidateExperiences: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      update: vi.fn((table) => {
        if (table === requirementMatches) requirementMatchesUpdated = true;
        if (table === tailoringSuggestions) tailoringUpdated = true;
        return { set: () => makeWhere() };
      }),
      delete: vi.fn((table) => {
        if (table === profileEvidence) evidenceDeleted = true;
        return makeWhere();
      }),
    };

    await wipeExtractedProfileData(db as never, "profile-1");

    expect(requirementMatchesUpdated).toBe(true);
    expect(tailoringUpdated).toBe(true);
    expect(evidenceDeleted).toBe(true);
  });
});
