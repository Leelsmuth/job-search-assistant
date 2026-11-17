import { describe, expect, it } from "vitest";
import {
  comparisonHighlights,
  locationBlocker,
  normalizeWorkplace,
} from "@/modules/compare/role";
import { LUMEN, MAPLE, NORTHWIND, QUILL, TIDEWATER, sampleRole } from "@/test/fixtures/compare-roles";

describe("comparisonHighlights", () => {
  it("marks the best fit, highest salary, and newest posting", () => {
    const highlights = comparisonHighlights([sampleRole(MAPLE), sampleRole(QUILL), sampleRole(NORTHWIND)]);
    expect(highlights.bestFit).toEqual([NORTHWIND]);
    expect(highlights.topSalary).toEqual([NORTHWIND]);
    expect(highlights.salaryCurrencies).toBeNull();
    expect(highlights.newest).toEqual([NORTHWIND]);
  });

  it("ranks salary on the top of the range, like the feed's salary sort", () => {
    expect(comparisonHighlights([sampleRole(NORTHWIND), sampleRole(LUMEN)]).topSalary).toEqual([LUMEN]);
  });

  it("does not rank salaries listed in different currencies", () => {
    const highlights = comparisonHighlights([sampleRole(NORTHWIND), sampleRole(TIDEWATER)]);
    expect(highlights.topSalary).toEqual([]);
    expect(highlights.salaryCurrencies).toEqual(["CAD", "USD"]);
    // Fit is still ranked.
    expect(highlights.bestFit).toEqual([NORTHWIND]);
  });

  it("marks every role that shares the top value", () => {
    const twin = sampleRole(MAPLE, { id: "twin", fitScore: 91 });
    expect(comparisonHighlights([sampleRole(NORTHWIND), twin, sampleRole(QUILL)]).bestFit).toEqual([
      NORTHWIND,
      "twin",
    ]);
  });

  it("marks nothing when every role ties", () => {
    const highlights = comparisonHighlights([sampleRole(NORTHWIND), sampleRole(NORTHWIND, { id: "twin" })]);
    expect(highlights.bestFit).toEqual([]);
    expect(highlights.topSalary).toEqual([]);
    expect(highlights.newest).toEqual([]);
  });

  it("leaves roles without a salary or a fit score out of those rankings", () => {
    const unpaid = sampleRole(MAPLE, { id: "unpaid", salaryMin: null, salaryMax: null, fitScore: null });
    expect(comparisonHighlights([sampleRole(QUILL), unpaid, sampleRole(MAPLE)]).topSalary).toEqual([QUILL]);
    // With one listed salary there is nothing to rank it against.
    expect(comparisonHighlights([sampleRole(QUILL), unpaid]).topSalary).toEqual([]);
    expect(comparisonHighlights([sampleRole(QUILL), unpaid]).bestFit).toEqual([]);
    // A missing salary does not count as another currency.
    expect(comparisonHighlights([sampleRole(QUILL), unpaid]).salaryCurrencies).toBeNull();
  });
});

describe("locationBlocker", () => {
  it("opens Remote-Canada, and in-area hybrid and on-site by default", () => {
    expect(locationBlocker("remote_canada", [])).toBeNull();
    expect(locationBlocker("hybrid_gta", [])).toBeNull();
    expect(locationBlocker("onsite_gta", [])).toBeNull();
  });

  it("blocks roles that need US work authorization, whatever the class", () => {
    for (const flag of ["us_work_authorization", "us_only"]) {
      expect(locationBlocker("remote_canada", [flag])).toEqual({
        detail: "Needs US work authorization",
        caution: "It needs US work authorization.",
      });
    }
  });

  it("blocks remote outside Canada and out-of-area roles", () => {
    expect(locationBlocker("remote_other", [])?.detail).toBe("Remote outside Canada");
    expect(locationBlocker("out_of_area", [])?.caution).toBe("It is outside your area.");
  });

  it("follows the person's settings for hybrid and on-site in their area", () => {
    const optIns = { includeHybridGta: false, includeOnsiteGta: false };
    expect(locationBlocker("hybrid_gta", [], optIns)?.caution).toBe(
      "It is hybrid, which you have turned off in Settings."
    );
    expect(locationBlocker("onsite_gta", [], optIns)?.detail).toBe("On-site, which is off in your Settings");
    expect(locationBlocker("remote_canada", [], optIns)).toBeNull();
  });

  it("does not call an unknown location a blocker", () => {
    expect(locationBlocker(null, [])).toBeNull();
  });
});

describe("normalizeWorkplace", () => {
  it("reads the spellings boards use", () => {
    expect(normalizeWorkplace("Remote")).toBe("remote");
    expect(normalizeWorkplace("hybrid")).toBe("hybrid");
    for (const value of ["on_site", "onsite", "On-site", "on site", "office"]) {
      expect(normalizeWorkplace(value)).toBe("on_site");
    }
    expect(normalizeWorkplace(null)).toBeNull();
    expect(normalizeWorkplace("flexible")).toBeNull();
  });
});
