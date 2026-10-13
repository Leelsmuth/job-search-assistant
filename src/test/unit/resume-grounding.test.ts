import { describe, expect, it } from "vitest";
import { buildTemplateCoverLetter, MIN_COVER_LETTER_WORDS, MAX_COVER_LETTER_WORDS } from "@/modules/documents/cover-letter";
import { profileCorpus, reviewBulletRewrite, reviewCoverLetter } from "@/modules/documents/grounding";
import { resolveTailoredResume } from "@/modules/documents/resolve-resume";
import { selectTailoredResume } from "@/modules/documents/select-resume";
import type { JobTailoringContext, ProfileSnapshot } from "@/modules/documents/types";

const source = {
  bullet: "Built React dashboards with TypeScript",
  company: "Acme",
  title: "Frontend Engineer",
  startDate: "2021",
  endDate: "2024",
  otherCompanies: ["DataCo"],
};

const profile: ProfileSnapshot = {
  displayName: "Ada Lovelace",
  location: "Toronto",
  summary: "Frontend engineer who ships accessible React interfaces.",
  yearsExperience: 8,
  targetTitles: ["Frontend Engineer"],
  skills: [
    { id: "skill-react", name: "React" },
    { id: "skill-ts", name: "TypeScript" },
  ],
  experiences: [
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
          text: "Built React dashboards with TypeScript",
          skills: ["React", "TypeScript"],
          impact: null,
        },
      ],
    },
  ],
  projects: [],
  education: [
    {
      id: "edu-1",
      institution: "University of Toronto",
      degree: "BSc",
      field: "Computer Science",
      startDate: null,
      endDate: "2018",
    },
  ],
  certifications: [],
};

const job: JobTailoringContext = {
  title: "Senior Frontend Engineer",
  companyName: "Northwind",
  description: "React and TypeScript product work.",
  technologies: ["React", "TypeScript"],
  responsibilities: [],
  requiredQualifications: [],
  preferredQualifications: [],
  frontendFitScore: 70,
  frontendFitReasons: ["React"],
  requirements: [],
  requirementMatches: [],
};

describe("resume grounding", () => {
  it("keeps a rewrite that only rephrases the bullet", () => {
    const review = reviewBulletRewrite(
      "Built React dashboards with TypeScript for the product",
      source
    );
    expect(review.grounded).toBe(true);
    expect(review.text).toContain("React");
  });

  it("flags a skill, metric, employer, or title that the bullet does not support", () => {
    expect(reviewBulletRewrite("Built React and Kubernetes dashboards", source).grounded).toBe(false);
    expect(reviewBulletRewrite("Built React dashboards used by 40% of customers", source).unsupportedClaims.join(" ")).toMatch(/40/);
    expect(reviewBulletRewrite("Built React dashboards at Google", source).unsupportedClaims.join(" ")).toMatch(/Google/);
    expect(reviewBulletRewrite("Built React dashboards at DataCo", source).unsupportedClaims.join(" ")).toMatch(/DataCo/);
    const titled = reviewBulletRewrite("As a Staff Engineer, built React dashboards with TypeScript", source);
    expect(titled.grounded).toBe(false);
    expect(titled.text).toBe(source.bullet);
  });

  it("allows the experience company and years already on the role", () => {
    const review = reviewBulletRewrite("Built React dashboards with TypeScript at Acme in 2021", source);
    expect(review.grounded).toBe(true);
  });

  it("flags cover-letter claims that are not in the profile", () => {
    const corpus = profileCorpus(profile);
    expect(
      reviewCoverLetter("I built Kubernetes platforms at Google and doubled revenue.", corpus, {
        organizations: ["Acme", "Northwind"],
        jobTitle: "Senior Frontend Engineer",
        titles: ["Frontend Engineer"],
      }).grounded
    ).toBe(false);
    expect(
      reviewCoverLetter("I built React dashboards with TypeScript at Acme.", corpus, {
        organizations: ["Acme", "Northwind"],
        jobTitle: "Senior Frontend Engineer",
        titles: ["Frontend Engineer"],
      }).grounded
    ).toBe(true);
  });

  it("fills a template in range without unsupported claims", () => {
    const highlighted = resolveTailoredResume(selectTailoredResume(profile, job), profile.yearsExperience);
    const letter = buildTemplateCoverLetter({
      profile,
      jobTitle: job.title,
      companyName: job.companyName,
      highlighted,
    });
    expect(letter.wordCount).toBeGreaterThanOrEqual(MIN_COVER_LETTER_WORDS);
    expect(letter.wordCount).toBeLessThanOrEqual(MAX_COVER_LETTER_WORDS);
    expect(letter.body).toMatch(/favour|centred/);
    expect(letter.body).not.toMatch(/\bcolor\b/i);
    const review = reviewCoverLetter(letter.body, profileCorpus(profile), {
      organizations: ["Acme", "Northwind"],
      jobTitle: job.title,
      titles: ["Frontend Engineer"],
    });
    expect(review.unsupportedClaims).toEqual([]);
  });
});
