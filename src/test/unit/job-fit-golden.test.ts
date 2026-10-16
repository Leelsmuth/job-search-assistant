import { describe, expect, it } from "vitest";
import { scoreJobFit, type FitJob, type FitProfile } from "@/modules/matching/fit-score";

const profile: FitProfile = {
  skills: [
    "React",
    "TypeScript",
    "JavaScript",
    "Next.js",
    "HTML",
    "CSS",
    "Tailwind CSS",
    "Node.js",
    "GraphQL",
    "Jest",
    "Playwright",
    "Git",
    "Accessibility",
  ],
  yearsExperience: 6,
  minimumSalaryCad: 140000,
  targetTitles: [
    "Frontend Engineer",
    "UI Engineer",
    "React Developer",
    "TypeScript Developer",
    "Full-Stack Engineer",
    "Design Engineer",
    "Web Platform Engineer",
  ],
};

function job(overrides: Partial<FitJob> & Pick<FitJob, "title">): FitJob {
  return {
    location: "Remote - Canada",
    workplaceType: "remote",
    description: "",
    ...overrides,
  };
}

describe("unified job fit", () => {
  const seniorToronto = scoreJobFit(
    job({
      title: "Senior Web Developer - Front End (React, JS)",
      location: "Toronto, ON",
      workplaceType: "hybrid",
      description:
        "5+ years building web UI with React and JavaScript. Hybrid in Toronto. TypeScript welcome.",
    }),
    profile
  );
  const staffFrontend = scoreJobFit(
    job({
      title: "Senior Staff SWE, Frontend (Web Infra) - Remote Canada",
      location: "Remote - Canada",
      workplaceType: "remote",
      description: "Frontend web infrastructure with React and TypeScript. Remote anywhere in Canada.",
    }),
    profile
  );
  const fullstack = scoreJobFit(
    job({
      title: "Full Stack Engineer (React)",
      location: "Remote, Canada",
      workplaceType: "remote",
      description: "React, TypeScript, and Node.js. 5+ years. Remote anywhere in Canada.",
    }),
    profile
  );
  const reactNative = scoreJobFit(
    job({
      title: "Mobile Developer (React Native)",
      description: "Build the iOS and Android app in React Native.",
    }),
    profile
  );
  const java = scoreJobFit(
    job({
      title: "Senior Java Full Stack",
      description: "Java, Spring Boot, and some JavaScript. 8+ years.",
    }),
    profile
  );
  const sdet = scoreJobFit(
    job({
      title: "SDET",
      location: "Toronto, ON",
      workplaceType: "hybrid",
      description: "Selenium and Java test automation.",
    }),
    profile
  );
  const designUs = scoreJobFit(
    job({
      title: "Design Engineer, United States",
      location: "United States",
      workplaceType: "remote",
      description: "Design systems for a US-only team.",
    }),
    profile
  );
  const productManager = scoreJobFit(
    job({
      title: "Product Manager",
      location: "Toronto, ON",
      workplaceType: "hybrid",
      description: "Own the roadmap.",
    }),
    profile
  );
  const staffAi = scoreJobFit(
    job({
      title: "Staff AI Engineer",
      description: "Train models and build ML infrastructure in Python.",
    }),
    profile
  );
  const dataArchitect = scoreJobFit(
    job({
      title: "Data Architect",
      location: "Toronto, ON",
      workplaceType: "hybrid",
      description: "Own the data platform.",
    }),
    profile
  );

  it("ranks a Toronto senior frontend role above full-stack React, then the misranked roles", () => {
    expect(seniorToronto.score).toBeGreaterThan(staffFrontend.score);
    expect(staffFrontend.score).toBeGreaterThan(fullstack.score);
    expect(fullstack.score).toBeGreaterThan(reactNative.score);
    expect(fullstack.score).toBeGreaterThan(java.score);
    expect(fullstack.score).toBeGreaterThan(sdet.score);
    expect(fullstack.score).toBeGreaterThan(designUs.score);
    expect(fullstack.score).toBeGreaterThan(productManager.score);
    expect(fullstack.score).toBeGreaterThan(staffAi.score);
    expect(seniorToronto.score).toBeGreaterThanOrEqual(80);
    expect(fullstack.score).toBeGreaterThanOrEqual(55);
    expect(reactNative.score).toBeLessThan(40);
    expect(java.score).toBeLessThan(40);
    expect(sdet.score).toBeLessThan(40);
    expect(staffAi.score).toBeLessThan(40);
  });

  it("scores every example, including ones that used to be unscored", () => {
    for (const result of [seniorToronto, staffFrontend, fullstack, reactNative, java, sdet, designUs, productManager]) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(result.score)).toBe(true);
    }
  });

  it("gates US-only, product, and data roles and keeps them scored", () => {
    expect(seniorToronto.eligible).toBe(true);
    expect(staffFrontend.eligible).toBe(true);
    expect(fullstack.eligible).toBe(true);
    expect(designUs.eligible).toBe(false);
    expect(designUs.ineligibleReason).toMatch(/United States|Canada/i);
    expect(productManager.eligible).toBe(false);
    expect(productManager.ineligibleReason).toMatch(/product management/i);
    expect(dataArchitect.eligible).toBe(false);
    expect(dataArchitect.ineligibleReason).toMatch(/data/i);
    expect(productManager.score).toBeLessThan(15);
  });

  it("does not treat React Native as React web and does not give unknown seniority a midpoint", () => {
    expect(reactNative.skillHits).not.toContain("React");
    expect(reactNative.missingCoreStacks).toContain("React Native");
    const unnamed = scoreJobFit(
      job({
        title: "Software Engineer",
        description: "Build products.",
      }),
      profile
    );
    expect(unnamed.breakdown.seniority.score).toBe(0);
    expect(unnamed.breakdown.pay.score).toBe(0);
    expect(unnamed.breakdown.role.score).toBeLessThanOrEqual(12);
  });

  it("gives a pay bonus only when a posted salary meets the minimum", () => {
    const meets = scoreJobFit(
      job({
        title: "Senior Frontend Engineer",
        description: "React and TypeScript. 5+ years.",
        salaryMin: 150000,
        salaryMax: 180000,
        salaryCurrency: "CAD",
      }),
      profile
    );
    const missing = scoreJobFit(
      job({
        title: "Senior Frontend Engineer",
        description: "React and TypeScript. 5+ years.",
      }),
      profile
    );
    const below = scoreJobFit(
      job({
        title: "Senior Frontend Engineer",
        description: "React and TypeScript. 5+ years.",
        salaryMax: 70000,
        salaryCurrency: "CAD",
      }),
      profile
    );
    expect(meets.breakdown.pay.score).toBeGreaterThan(0);
    expect(missing.breakdown.pay.score).toBe(0);
    expect(meets.score).toBeGreaterThan(missing.score);
    expect(below.breakdown.pay.score).toBeLessThan(0);
    expect(below.score).toBeLessThan(missing.score);
  });

  it("exposes a per-component reason", () => {
    expect(seniorToronto.components.map((component) => component.id)).toEqual([
      "role",
      "stack",
      "seniority",
      "pay",
    ]);
    expect(seniorToronto.components.every((component) => component.reason.length > 0)).toBe(true);
  });
});
