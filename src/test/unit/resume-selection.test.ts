import { describe, expect, it } from "vitest";
import { applyBulletRewrites, selectTailoredResume } from "@/modules/documents/select-resume";
import {
  masterResumeFromDraft,
  resolveTailoredResume,
  setAllDecisions,
  setChangeDecision,
} from "@/modules/documents/resolve-resume";
import type { JobTailoringContext, ProfileSnapshot } from "@/modules/documents/types";

const profile: ProfileSnapshot = {
  displayName: "Ada Lovelace",
  location: "Toronto",
  summary: "Frontend engineer who ships accessible React interfaces.",
  yearsExperience: 8,
  targetTitles: ["Frontend Engineer"],
  skills: [
    { id: "skill-python", name: "Python" },
    { id: "skill-ts", name: "TypeScript" },
    { id: "skill-react", name: "React" },
    { id: "skill-cooking", name: "Cooking" },
  ],
  experiences: [
    {
      id: "exp-beta",
      company: "Beta",
      title: "UI Engineer",
      startDate: "2019",
      endDate: "2020",
      location: "Toronto",
      description: null,
      bullets: [
        {
          id: "bullet-ts",
          text: "Used TypeScript for internal tools",
          skills: ["TypeScript"],
          impact: null,
        },
      ],
    },
    {
      id: "exp-data",
      company: "DataCo",
      title: "Analyst",
      startDate: "2018",
      endDate: "2019",
      location: "Ottawa",
      description: null,
      bullets: [
        {
          id: "bullet-python",
          text: "Maintained Python data pipelines",
          skills: ["Python"],
          impact: null,
        },
      ],
    },
    {
      id: "exp-acme",
      company: "Acme",
      title: "Frontend Engineer",
      startDate: "2021",
      endDate: "2024",
      location: "Toronto",
      description: null,
      bullets: [
        {
          id: "bullet-react",
          text: "Built React and TypeScript dashboards",
          skills: ["React", "TypeScript"],
          impact: null,
        },
      ],
    },
  ],
  projects: [
    {
      id: "project-recipe",
      name: "Recipe box",
      description: "A cooking tracker",
      skills: ["Cooking"],
      evidence: null,
    },
    {
      id: "project-ui",
      name: "UI kit",
      description: "React component kit",
      skills: ["React"],
      evidence: null,
    },
  ],
  education: [],
  certifications: [],
};

const job: JobTailoringContext = {
  title: "React Developer",
  companyName: "Northwind",
  description: "Looking for React and TypeScript.",
  technologies: ["React", "TypeScript"],
  responsibilities: [],
  requiredQualifications: [],
  preferredQualifications: [],
  frontendFitScore: 82,
  frontendFitReasons: ["React experience"],
  requirements: [
    { text: "Experience with React", normalizedSkill: "React", importance: "required" },
  ],
  requirementMatches: [
    {
      requirementText: "Experience with React",
      normalizedSkill: "React",
      importance: "required",
      matchStatus: "confirmed",
      confidence: 1,
      evidenceText: "Built React and TypeScript dashboards",
    },
  ],
};

describe("tailored resume selection", () => {
  it("ranks confirmed React evidence ahead of weaker TypeScript overlap", () => {
    const draft = selectTailoredResume(profile, job);
    const resolved = resolveTailoredResume(draft, profile.yearsExperience);
    expect(resolved.experiences.map((item) => item.company)).toEqual(["Acme", "Beta"]);
    expect(resolved.skills.slice(0, 2)).toEqual(["React", "TypeScript"]);
    expect(resolved.projects.map((item) => item.name)).toEqual(["UI kit"]);
    expect(draft.experiences.every((experience) =>
      experience.bullets.every((bullet) => bullet.suggestedText === bullet.originalText)
    )).toBe(true);
  });

  it("is deterministic aside from the timestamp", () => {
    const first = selectTailoredResume(profile, job);
    const second = selectTailoredResume(profile, job);
    const { generatedAt: firstAt, ...firstRest } = first;
    const { generatedAt: secondAt, ...secondRest } = second;
    expect(firstAt).toEqual(expect.any(String));
    expect(secondAt).toEqual(expect.any(String));
    expect(secondRest).toEqual(firstRest);
  });

  it("uses frontend fit reasons when the posting text is empty", () => {
    const fitProfile: ProfileSnapshot = {
      ...profile,
      skills: [],
      projects: [],
      experiences: [
        {
          id: "exp-archive",
          company: "Archive",
          title: "Archivist",
          startDate: null,
          endDate: null,
          location: null,
          description: null,
          bullets: [{ id: "bullet-archive", text: "Maintained internal archives", skills: [], impact: null }],
        },
        {
          id: "exp-a11y",
          company: "Acme",
          title: "Engineer",
          startDate: null,
          endDate: null,
          location: null,
          description: null,
          bullets: [
            {
              id: "bullet-a11y",
              text: "Improved accessibility of the component library",
              skills: [],
              impact: null,
            },
          ],
        },
      ],
    };
    const fitJob: JobTailoringContext = {
      ...job,
      title: "Role",
      description: "",
      technologies: [],
      requirements: [],
      requirementMatches: [],
      frontendFitScore: 90,
      frontendFitReasons: ["accessibility"],
    };
    const resolved = resolveTailoredResume(selectTailoredResume(fitProfile, fitJob));
    expect(resolved.experiences.map((item) => item.company)).toEqual(["Acme"]);
    expect(resolved.experiences[0]?.bullets[0]).toContain("accessibility");
  });

  it("puts a confirmed evidence bullet ahead of an unrelated one", () => {
    const designProfile: ProfileSnapshot = {
      ...profile,
      skills: [],
      projects: [],
      experiences: [
        {
          id: "exp-design",
          company: "Acme",
          title: "Frontend Engineer",
          startDate: null,
          endDate: null,
          location: null,
          description: null,
          bullets: [
            { id: "bullet-docs", text: "Wrote internal documentation", skills: [], impact: null },
            {
              id: "bullet-system",
              text: "Built a design system used by three squads",
              skills: [],
              impact: null,
            },
          ],
        },
      ],
    };
    const designJob: JobTailoringContext = {
      ...job,
      title: "Role",
      description: "",
      technologies: [],
      frontendFitReasons: [],
      requirements: [{ text: "design systems", normalizedSkill: "design systems", importance: "required" }],
      requirementMatches: [
        {
          requirementText: "design systems",
          normalizedSkill: "design systems",
          importance: "required",
          matchStatus: "confirmed",
          confidence: 0.95,
          evidenceText: "Built a design system used by three squads",
        },
      ],
    };
    const resolved = resolveTailoredResume(selectTailoredResume(designProfile, designJob));
    expect(resolved.experiences[0]?.bullets[0]).toBe("Built a design system used by three squads");
  });

  it("restores profile order and original bullets when every change is rejected", () => {
    const draft = selectTailoredResume(profile, job);
    const restored = resolveTailoredResume(setAllDecisions(draft, "rejected"));
    const master = masterResumeFromDraft(draft);
    expect(restored.experiences.map((item) => item.company)).toEqual(
      master.experiences.map((item) => item.company)
    );
    expect(restored.experiences.flatMap((item) => item.bullets)).toEqual(
      master.experiences.flatMap((item) => item.bullets)
    );
    expect(restored.skills).toEqual(master.skills);
    expect(restored.projects.map((item) => item.name)).toEqual(master.projects.map((item) => item.name));
  });

  it("keeps an omitted experience when that omission is rejected", () => {
    const draft = selectTailoredResume(profile, job);
    const omit = draft.changes.find((change) => change.id === "omit-experience:exp-data");
    expect(omit).toBeTruthy();
    const resolved = resolveTailoredResume(setChangeDecision(draft, omit!.id, "rejected"));
    expect(resolved.experiences.map((item) => item.company)).toContain("DataCo");
  });

  it("does not keep a rewrite that introduces a skill or metric", () => {
    const draft = selectTailoredResume(profile, job);
    const rewritten = applyBulletRewrites(
      draft,
      [
        { id: "bullet-react", text: "Built React, TypeScript, and Kubernetes dashboards serving 40% of users" },
        { id: "bullet-ts", text: "Used TypeScript for internal tools across the product" },
      ],
      profile
    );
    const react = rewritten.experiences
      .flatMap((experience) => experience.bullets)
      .find((bullet) => bullet.id === "bullet-react");
    const typed = rewritten.experiences
      .flatMap((experience) => experience.bullets)
      .find((bullet) => bullet.id === "bullet-ts");
    expect(react?.suggestedText).toBe("Built React and TypeScript dashboards");
    expect(react?.unsupportedClaims.join(" ")).toMatch(/Kubernetes|40/);
    expect(typed?.suggestedText).toBe("Used TypeScript for internal tools across the product");
    expect(rewritten.changes.some((change) => change.id === "rewrite-bullet:bullet-ts")).toBe(true);
    expect(rewritten.changes.some((change) => change.id === "rewrite-bullet:bullet-react")).toBe(false);
  });
});
