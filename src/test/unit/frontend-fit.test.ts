import { describe, expect, it } from "vitest";
import { scoreFrontendFit } from "@/modules/matching/frontend-fit";

describe("scoreFrontendFit", () => {
  const profile = {
    skills: ["React", "TypeScript", "Next.js"],
    targetTitles: ["Frontend Engineer"],
    preferredSeniority: "senior",
    minimumSalaryCad: 140000,
  };

  it("scores a senior React role in CAD above a backend role", () => {
    const frontend = scoreFrontendFit(
      {
        title: "Senior Frontend Engineer",
        description:
          "Build product UI with React, TypeScript, Next.js, Tailwind CSS, WCAG accessibility, Playwright, and our design system. Care about Core Web Vitals.",
        salaryMin: 150000,
        salaryMax: 180000,
        salaryCurrency: "CAD",
      },
      profile
    );
    const backend = scoreFrontendFit(
      {
        title: "Senior Backend Engineer",
        description: "Design Go services on Kubernetes.",
        salaryMin: 160000,
        salaryMax: 190000,
        salaryCurrency: "CAD",
      },
      profile
    );

    expect(frontend.score).toBeGreaterThan(85);
    expect(frontend.score).toBeGreaterThan(backend.score + 30);
    expect(frontend.reasons.join(" ")).toMatch(/frontend/i);
    expect(frontend.reasons.join(" ")).toMatch(/React/);
    expect(frontend.skillHits).toEqual(
      expect.arrayContaining(["React", "TypeScript", "Next.js", "CSS/Tailwind", "accessibility"])
    );
    expect(backend.score).toBeLessThan(45);
  });

  it("penalizes intern roles and CAD offers under the minimum", () => {
    const result = scoreFrontendFit(
      {
        title: "Frontend Engineer Intern",
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

  it("converts USD and notes missing compensation without calling a model", () => {
    const usd = scoreFrontendFit(
      {
        title: "UI Engineer",
        description: "React and TypeScript.",
        salaryMin: 120000,
        salaryCurrency: "USD",
      },
      profile
    );
    const unlisted = scoreFrontendFit(
      { title: "Design Engineer", description: "Design systems and CSS." },
      { preferredSeniority: "senior" }
    );

    expect(usd.reasons.join(" ")).toMatch(/USD/);
    expect(unlisted.reasons.join(" ")).toMatch(/not listed/i);
    expect(unlisted.score).toBeGreaterThan(40);
  });

  it("gives full-stack frontend-leaning titles a mid-high title score", () => {
    const result = scoreFrontendFit({
      title: "Full Stack Engineer",
      description: "React, TypeScript, and Node APIs.",
      technologies: ["React", "TypeScript"],
    });
    expect(result.breakdown.title).toBeGreaterThanOrEqual(18);
    expect(result.breakdown.title).toBeLessThanOrEqual(30);
    expect(result.skillHits).toContain("React");
  });
});
