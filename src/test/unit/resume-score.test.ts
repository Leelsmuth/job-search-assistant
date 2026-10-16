import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectTailoredResume } from "@/modules/documents/select-resume";
import { renderResumePlainText } from "@/modules/documents/render-resume";
import { resolveTailoredResume } from "@/modules/documents/resolve-resume";
import type { JobTailoringContext, ProfileSnapshot } from "@/modules/documents/types";
import { applyAcceptedResumeSuggestions } from "@/modules/resume-score/apply-suggestions";
import { assessAtsFormat } from "@/modules/resume-score/ats-format";
import { extractJobRequirements } from "@/modules/resume-score/extract-jd";
import { combineResumeScore, scoreResumeMatch } from "@/modules/resume-score/score";
import { RESUME_SUGGESTION_JSON_SCHEMA } from "@/modules/resume-score/suggest";
import type { ResumeScoreEvidence } from "@/modules/resume-score/types";
import {
  finalizeResumeSuggestions,
  recheckStoredSuggestions,
  supportedSkillsFromEvidence,
} from "@/modules/resume-score/verify-suggestions";

const description = readFileSync(
  resolve(process.cwd(), "src/test/fixtures/resume-score/job-description.txt"),
  "utf8"
);
const resume = readFileSync(resolve(process.cwd(), "src/test/fixtures/resume-score/resume.txt"), "utf8");

const evidence: ResumeScoreEvidence[] = [
  {
    id: "e-next",
    sourceType: "resume_bullet",
    text: "Shipped a Next.js marketing site with Tailwind CSS.",
    normalizedSkills: ["Next.js", "Tailwind CSS"],
  },
  {
    id: "e-degree",
    sourceType: "education",
    text: "B.Sc. Computer Science, University of Toronto",
    normalizedSkills: [],
  },
];

const job = { title: "Senior Frontend Engineer", description };

describe("job requirement extraction", () => {
  const extracted = extractJobRequirements(job);

  it("splits required skills, preferred skills, years, seniority, and must-haves", () => {
    expect(extracted.requiredSkills).toEqual(["React", "TypeScript"]);
    expect(extracted.preferredSkills).toEqual(["Next.js", "JavaScript", "CSS", "Tailwind CSS", "Playwright"]);
    expect(extracted.seniority).toBe("senior");
    expect(extracted.yearsRequired).toBe(5);
    expect(extracted.mustHaveQualifications.some((line) => /bachelor/i.test(line))).toBe(true);
    expect(extracted.mustHaveQualifications.some((line) => /authorized to work/i.test(line))).toBe(true);
    expect(extracted.keywords.map((keyword) => keyword.term)).toEqual(
      expect.arrayContaining(["React", "TypeScript", "Next.js", "Playwright", "Bachelor's degree", "Work authorization"])
    );
  });
});

describe("resume ATS scoring", () => {
  const result = scoreResumeMatch(
    job,
    { text: resume, fileType: "pdf" },
    {
      skills: ["React", "TypeScript", "Next.js", "JavaScript"],
      yearsExperience: 6,
      titles: ["Senior Frontend Engineer"],
      evidence,
    }
  );

  it("scores the fixture resume and splits missing keywords by evidence", () => {
    expect(result.subscores.hardSkills).toBe(100);
    expect(result.subscores.seniority).toBe(100);
    expect(result.subscores.experienceYears).toBe(100);
    expect(result.subscores.atsFormat).toBe(100);
    expect(result.overall).toBe(combineResumeScore(result.subscores));
    expect(result.overall).toBeGreaterThan(70);
    expect(result.add.map((item) => item.term)).toEqual(["Bachelor's degree", "Next.js", "Tailwind CSS"]);
    expect(result.gaps.map((item) => item.term)).toEqual(["Playwright", "Work authorization"]);
    expect(result.add.find((item) => item.term === "Next.js")?.evidence?.id).toBe("e-next");
    expect(result.add.find((item) => item.term === "Bachelor's degree")?.evidence?.text).toMatch(/B\.Sc/);
    expect(result.gaps.every((item) => item.evidence == null)).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("fails ATS checks for an unreadable file, missing contact, and a bad date", () => {
    const checks = assessAtsFormat({
      text: "Built interfaces\n13/2020 - Present",
      fileType: "png",
    });
    expect(checks.find((check) => check.id === "contact")?.passed).toBe(false);
    expect(checks.find((check) => check.id === "fileType")?.passed).toBe(false);
    expect(checks.find((check) => check.id === "dates")?.passed).toBe(false);
    expect(checks.find((check) => check.id === "headings")?.passed).toBe(false);
  });
});

describe("resume suggestions stay inside evidence", () => {
  const bullets = [{ id: "b1", text: "Built React and TypeScript interfaces for product teams." }];
  const profileSkills = ["React", "TypeScript", "Next.js"];

  function finish(suggestedText: string, keywords: string[]) {
    return finalizeResumeSuggestions(
      [{ bulletId: "b1", originalText: bullets[0].text, suggestedText, keywords, evidenceIds: ["e-next"] }],
      { bullets, evidence, profileSkills }
    );
  }

  it("keeps a rewrite that cites a supported keyword", () => {
    const kept = finish(
      "Built React and TypeScript interfaces, including a Next.js marketing site.",
      ["Next.js"]
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.keywords).toEqual(["Next.js", "JavaScript"]);
    expect(kept[0]?.evidence[0]?.id).toBe("e-next");
  });

  it("never includes skills without evidence", () => {
    const unsupported = ["Kubernetes", "Java", "Swift", "Playwright", "ServiceNow"];
    for (const skill of unsupported) {
      const claimed = finish(`Built React, TypeScript, and ${skill} interfaces for product teams.`, [skill]);
      const mixed = finish(
        `Built React and TypeScript interfaces with ${skill}, plus a Next.js marketing site.`,
        ["Next.js", skill]
      );
      expect(claimed, skill).toEqual([]);
      expect(mixed, skill).toEqual([]);
    }

    const supported = supportedSkillsFromEvidence(profileSkills, evidence);
    const samples = [
      finish("Built React and TypeScript interfaces, including a Next.js marketing site.", ["Next.js"]),
      finish("Built React, TypeScript, and Kubernetes interfaces for product teams.", ["Kubernetes"]),
      finish("Built React and TypeScript interfaces with Playwright.", ["Playwright"]),
    ].flat();
    for (const suggestion of samples) {
      expect(suggestion.keywords.every((keyword) => supported.has(keyword))).toBe(true);
      const original = new Set(["React", "TypeScript"]);
      const added = suggestion.keywords.filter((keyword) => !original.has(keyword));
      expect(added.every((keyword) => supported.has(keyword))).toBe(true);
    }

    const stored = recheckStoredSuggestions(
      [
        {
          bulletId: "b1",
          originalText: bullets[0].text,
          suggestedText: "Built React and TypeScript interfaces with Kubernetes.",
          keywords: ["Kubernetes"],
          evidence: [{ id: "e-next", sourceType: "resume_bullet", text: evidence[0].text }],
        },
      ],
      { evidence, profileSkills }
    );
    expect(stored).toEqual([]);
  });
});

describe("accepted suggestions rescore on the tailored resume", () => {
  it("raises the score after a supported keyword is applied", () => {
    const profile: ProfileSnapshot = {
      displayName: "Alex Chen",
      location: "Toronto",
      summary: "Senior frontend engineer.",
      yearsExperience: 6,
      targetTitles: ["Senior Frontend Engineer"],
      skills: [
        { id: "s1", name: "React" },
        { id: "s2", name: "TypeScript" },
      ],
      experiences: [
        {
          id: "exp-1",
          company: "Northwind",
          title: "Senior Frontend Engineer",
          startDate: "Jan 2020",
          endDate: "Present",
          location: "Toronto",
          description: null,
          bullets: [
            {
              id: "b1",
              text: "Built React and TypeScript interfaces for product teams.",
              skills: ["React", "TypeScript"],
              impact: null,
            },
          ],
        },
      ],
      projects: [],
      education: [],
      certifications: [],
    };
    const tailoring: JobTailoringContext = {
      title: job.title,
      companyName: "Northwind",
      description,
      technologies: [],
      responsibilities: [],
      requiredQualifications: [],
      preferredQualifications: [],
      frontendFitScore: null,
      frontendFitReasons: [],
      requirements: [],
      requirementMatches: [],
    };
    const original = selectTailoredResume(profile, tailoring);
    const beforeText = renderResumePlainText(resolveTailoredResume(original, 6));
    const draft = applyAcceptedResumeSuggestions(original, [
      {
        bulletId: "b1",
        suggestedText: "Built React and TypeScript interfaces, including a Next.js marketing site.",
      },
    ]);
    const afterText = renderResumePlainText(resolveTailoredResume(draft, 6));
    const shared = {
      skills: profile.skills.map((skill) => skill.name),
      yearsExperience: 6,
      evidence,
    };
    const before = scoreResumeMatch(job, {
      text: beforeText,
      fileType: "pdf",
      exportedByApp: true,
      contactEmail: "alex@example.com",
    }, shared);
    const after = scoreResumeMatch(job, {
      text: afterText,
      fileType: "pdf",
      exportedByApp: true,
      contactEmail: "alex@example.com",
    }, shared);
    expect(afterText).toMatch(/Next\.js/);
    expect(after.overall).toBeGreaterThan(before.overall);
    expect(after.add.map((item) => item.term)).not.toContain("Next.js");
  });
});

describe("suggestion schema", () => {
  it("is a strict object with no extra properties", () => {
    expect(RESUME_SUGGESTION_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(RESUME_SUGGESTION_JSON_SCHEMA.required).toEqual(["suggestions"]);
    const item = RESUME_SUGGESTION_JSON_SCHEMA.properties.suggestions.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(["bulletId", "originalText", "suggestedText", "keywords", "evidenceIds"]);
  });
});
