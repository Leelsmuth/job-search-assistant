import { describe, expect, it } from "vitest";
import { scoreFrontendFit } from "@/modules/matching/frontend-fit";

describe("scoreFrontendFit", () => {
  const profile = {
    skills: ["React", "TypeScript", "Next.js", "CSS", "JavaScript"],
    targetTitles: ["Frontend Engineer"],
    preferredSeniority: "senior",
    yearsExperience: 6,
    minimumSalaryCad: 140000,
  };

  it("scores a senior React role in CAD above a backend role", () => {
    const frontend = scoreFrontendFit(
      {
        title: "Senior Frontend Engineer",
        location: "Remote - Canada",
        workplaceType: "remote",
        description:
          "Build product UI with React, TypeScript, Next.js, Tailwind CSS, WCAG accessibility, Playwright, and our design system. 5+ years. Care about Core Web Vitals.",
        salaryMin: 150000,
        salaryMax: 180000,
        salaryCurrency: "CAD",
      },
      profile
    );
    const backend = scoreFrontendFit(
      {
        title: "Senior Backend Engineer",
        location: "Remote - Canada",
        workplaceType: "remote",
        description: "Design Go services on Kubernetes.",
        salaryMin: 160000,
        salaryMax: 190000,
        salaryCurrency: "CAD",
      },
      profile
    );

    expect(frontend.score).toBeGreaterThan(80);
    expect(frontend.score).toBeGreaterThan(backend.score + 30);
    expect(frontend.reasons.join(" ")).toMatch(/frontend/i);
    expect(frontend.skillHits).toEqual(expect.arrayContaining(["React", "TypeScript", "Next.js"]));
    expect(backend.score).toBeLessThan(45);
  });

  it("penalizes intern roles and CAD offers under the minimum", () => {
    const result = scoreFrontendFit(
      {
        title: "Frontend Engineer Intern",
        location: "Toronto, ON",
        workplaceType: "hybrid",
        description: "Learn React.",
        salaryMax: 70000,
        salaryCurrency: "CAD",
      },
      profile
    );
    expect(result.breakdown.seniority).toBeLessThan(8);
    expect(result.breakdown.compensation).toBeLessThan(10);
    expect(result.reasons.join(" ")).toMatch(/below your CAD/i);
  });

  it("converts USD and gives missing compensation no midpoint", () => {
    const usd = scoreFrontendFit(
      {
        title: "UI Engineer",
        location: "Remote - Canada",
        workplaceType: "remote",
        description: "React and TypeScript. 5+ years.",
        salaryMin: 120000,
        salaryCurrency: "USD",
      },
      profile
    );
    const unlisted = scoreFrontendFit(
      {
        title: "Design Engineer",
        location: "Toronto, ON",
        workplaceType: "hybrid",
        description: "Design systems and CSS.",
      },
      { preferredSeniority: "senior", yearsExperience: 6 }
    );

    expect(usd.reasons.join(" ")).toMatch(/USD/);
    expect(unlisted.reasons.join(" ")).toMatch(/not listed/i);
    expect(unlisted.breakdown.compensation).toBe(0);
    expect(unlisted.breakdown.seniority).toBe(0);
    expect(unlisted.score).toBeLessThan(40);
  });

  it("gives full-stack frontend-leaning titles a mid-high title score", () => {
    const result = scoreFrontendFit(
      {
        title: "Full Stack Engineer",
        location: "Remote - Canada",
        workplaceType: "remote",
        description: "React, TypeScript, and Node APIs. 5+ years.",
        technologies: ["React", "TypeScript"],
      },
      profile
    );
    expect(result.breakdown.title).toBeGreaterThanOrEqual(18);
    expect(result.breakdown.title).toBeLessThanOrEqual(30);
    expect(result.skillHits).toContain("React");
  });
});
