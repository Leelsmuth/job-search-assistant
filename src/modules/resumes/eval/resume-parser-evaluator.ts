import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";

export type EvalMetric = {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
};

export type EvalResult = {
  fixtureName: string;
  passed: boolean;
  metrics: EvalMetric[];
  sectionDetectionScore: number;
  experienceEntryScore: number;
  achievementGroupingScore: number;
  contactFieldScore: number;
  skillPrecision: number;
  unclassifiedCount: number;
};

function includesNormalized(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function evaluateParsedResume(
  fixtureName: string,
  parsed: ParsedResume,
  expectations: {
    summaryContains?: string[];
    skillCategories?: string[];
    skills?: string[];
    companies?: string[];
    titles?: string[];
    achievementsContain?: string[];
    achievementsMustNotContain?: string[];
    certifications?: string[];
    educationInstitutions?: string[];
    contactFields?: Partial<Record<"email" | "linkedInUrl" | "githubUrl", string>>;
  }
): EvalResult {
  const metrics: EvalMetric[] = [];

  for (const phrase of expectations.summaryContains ?? []) {
    metrics.push({
      name: `summary contains "${phrase}"`,
      passed: includesNormalized(parsed.professionalSummary, phrase),
      expected: phrase,
      actual: parsed.professionalSummary ?? undefined,
    });
  }

  for (const cat of expectations.skillCategories ?? []) {
    const found = parsed.skillGroups.some((g) =>
      includesNormalized(g.category, cat)
    );
    metrics.push({
      name: `skill category "${cat}"`,
      passed: found,
      expected: cat,
    });
  }

  for (const skill of expectations.skills ?? []) {
    const found = parsed.skillGroups.some((g) =>
      g.skills.some((s) => s.toLowerCase() === skill.toLowerCase())
    );
    metrics.push({
      name: `skill "${skill}"`,
      passed: found,
      expected: skill,
    });
  }

  for (const company of expectations.companies ?? []) {
    const found = parsed.experience.some((e) =>
      includesNormalized(e.company, company)
    );
    metrics.push({
      name: `company "${company}"`,
      passed: found,
      expected: company,
    });
  }

  for (const title of expectations.titles ?? []) {
    const found = parsed.experience.some((e) =>
      includesNormalized(e.title, title)
    );
    metrics.push({
      name: `title "${title}"`,
      passed: found,
      expected: title,
    });
  }

  const allAchievements = parsed.experience.flatMap((e) => e.achievements);

  for (const phrase of expectations.achievementsContain ?? []) {
    const found = allAchievements.some((a) => includesNormalized(a, phrase));
    metrics.push({
      name: `achievement contains "${phrase}"`,
      passed: found,
      expected: phrase,
    });
  }

  for (const phrase of expectations.achievementsMustNotContain ?? []) {
    const found = allAchievements.some((a) => includesNormalized(a, phrase));
    metrics.push({
      name: `achievement must not contain "${phrase}"`,
      passed: !found,
      expected: `not ${phrase}`,
    });
  }

  for (const cert of expectations.certifications ?? []) {
    const found = parsed.certifications.some((c) =>
      includesNormalized(c.name, cert)
    );
    metrics.push({
      name: `certification "${cert}"`,
      passed: found,
      expected: cert,
    });
  }

  for (const inst of expectations.educationInstitutions ?? []) {
    const found = parsed.education.some((e) =>
      includesNormalized(e.institution, inst)
    );
    metrics.push({
      name: `education "${inst}"`,
      passed: found,
      expected: inst,
    });
  }

  if (expectations.contactFields) {
    for (const [field, value] of Object.entries(expectations.contactFields)) {
      const actual = parsed.contact[field as keyof typeof parsed.contact];
      const passed =
        typeof actual === "string" && includesNormalized(actual, value);
      metrics.push({
        name: `contact.${field}`,
        passed,
        expected: value,
        actual: typeof actual === "string" ? actual : undefined,
      });
    }
  }

  const passedCount = metrics.filter((m) => m.passed).length;
  const total = metrics.length || 1;

  return {
    fixtureName,
    passed: passedCount === total,
    metrics,
    sectionDetectionScore: passedCount / total,
    experienceEntryScore:
      (expectations.companies?.filter((c) =>
        parsed.experience.some((e) => includesNormalized(e.company, c))
      ).length ?? 0) / Math.max(expectations.companies?.length ?? 1, 1),
    achievementGroupingScore:
      (expectations.achievementsContain?.filter((p) =>
        allAchievements.some((a) => includesNormalized(a, p))
      ).length ?? 0) / Math.max(expectations.achievementsContain?.length ?? 1, 1),
    contactFieldScore:
      Object.keys(expectations.contactFields ?? {}).length > 0
        ? metrics.filter((m) => m.name.startsWith("contact.") && m.passed).length /
          Object.keys(expectations.contactFields ?? {}).length
        : 1,
    skillPrecision:
      (expectations.skills?.filter((s) =>
        parsed.skillGroups.some((g) =>
          g.skills.some((sk) => sk.toLowerCase() === s.toLowerCase())
        )
      ).length ?? 0) / Math.max(expectations.skills?.length ?? 1, 1),
    unclassifiedCount: parsed.unclassified.length,
  };
}
