import { describe, expect, it } from "vitest";
import {
  classifyLocationEligibility,
  isLocationVisible,
  LOCATION_FEED_RANK,
} from "@/modules/location/eligibility";

describe("classifyLocationEligibility", () => {
  it("treats remote Canada and worldwide remote as Remote-Canada", () => {
    expect(
      classifyLocationEligibility({
        location: "Remote - Canada",
        workplaceType: "remote",
        description: "Work from Canada.",
      }).class
    ).toBe("remote_canada");

    expect(
      classifyLocationEligibility({
        location: "Remote",
        workplaceType: "remote",
        description: "Work from anywhere.",
      }).class
    ).toBe("remote_canada");

    expect(
      classifyLocationEligibility({
        location: "Remote (US or Canada)",
        workplaceType: "remote",
        description: "Open to candidates in Canada or the US.",
      }).class
    ).toBe("remote_canada");
  });

  it("hides US-only remote and flags work authorization", () => {
    const usOnly = classifyLocationEligibility({
      location: "Remote (US only)",
      workplaceType: "remote",
      description: "Must be located in the United States.",
    });
    expect(usOnly.class).toBe("remote_other");
    expect(usOnly.flags).toContain("us_only");

    const auth = classifyLocationEligibility({
      location: "Remote",
      workplaceType: "remote",
      description: "Must be authorized to work in the United States.",
    });
    expect(auth.class).toBe("remote_other");
    expect(auth.flags).toContain("us_work_authorization");
  });

  it("flags visa-sponsorship language when Canada is not clearly eligible", () => {
    const result = classifyLocationEligibility({
      location: "Remote",
      workplaceType: "remote",
      description: "Visa sponsorship available for the right candidate.",
    });
    expect(result.class).toBe("remote_other");
    expect(result.flags).toContain("visa_sponsorship_ambiguous");
  });

  it("keeps a Canada-eligible remote role and still flags sponsorship ambiguity", () => {
    const result = classifyLocationEligibility({
      location: "Remote - Canada",
      workplaceType: "remote",
      description: "Canada residents. Visa sponsorship available in some cases.",
    });
    expect(result.class).toBe("remote_canada");
    expect(result.flags).toContain("visa_sponsorship_ambiguous");
  });

  it("treats a bare remote posting as ambiguous", () => {
    const result = classifyLocationEligibility({
      location: "Remote",
      workplaceType: "remote",
      description: "Join our engineering team.",
    });
    expect(result.class).toBe("remote_other");
    expect(result.flags).toContain("eligibility_ambiguous");
  });

  it("classifies GTA hybrid and on-site roles, and rejects the rest of Canada", () => {
    expect(
      classifyLocationEligibility({
        location: "Toronto, ON",
        workplaceType: "hybrid",
        description: "Three days in the office.",
      }).class
    ).toBe("hybrid_gta");

    expect(
      classifyLocationEligibility({
        location: "Mississauga",
        workplaceType: "on_site",
        description: "On-site collaboration.",
      }).class
    ).toBe("onsite_gta");

    expect(
      classifyLocationEligibility({
        location: "Vancouver, BC",
        workplaceType: "hybrid",
        description: "Hybrid in Vancouver.",
      }).class
    ).toBe("out_of_area");

    expect(
      classifyLocationEligibility({
        location: "New York, NY",
        workplaceType: "on_site",
        description: "On-site in Manhattan.",
      }).class
    ).toBe("out_of_area");
  });

  it("does not treat New York as a GTA city", () => {
    expect(
      classifyLocationEligibility({
        location: "New York",
        workplaceType: "hybrid",
        description: "Hybrid in New York.",
      }).class
    ).toBe("out_of_area");
  });

  it("uses a custom GTA city list", () => {
    expect(
      classifyLocationEligibility(
        { location: "Hamilton", workplaceType: "hybrid", description: "Hybrid." },
        { gtaCities: ["Hamilton"] }
      ).class
    ).toBe("hybrid_gta");
  });

  it("ranks Remote-Canada ahead of GTA hybrid and on-site", () => {
    expect(LOCATION_FEED_RANK.remote_canada).toBeLessThan(LOCATION_FEED_RANK.hybrid_gta);
    expect(LOCATION_FEED_RANK.hybrid_gta).toBeLessThan(LOCATION_FEED_RANK.onsite_gta);
    expect(LOCATION_FEED_RANK.onsite_gta).toBeLessThan(LOCATION_FEED_RANK.remote_other);
  });

  it("hides US-only and out-of-area unless the view opts in", () => {
    const hidden = {
      includeHybridGta: true,
      includeOnsiteGta: true,
      showRemoteOther: false,
      showOutOfArea: false,
    };
    expect(isLocationVisible("remote_canada", hidden)).toBe(true);
    expect(isLocationVisible("hybrid_gta", hidden)).toBe(true);
    expect(isLocationVisible("onsite_gta", hidden)).toBe(true);
    expect(isLocationVisible("remote_other", hidden)).toBe(false);
    expect(isLocationVisible("out_of_area", hidden)).toBe(false);
    expect(isLocationVisible("remote_other", { ...hidden, showRemoteOther: true })).toBe(true);
  });
});
