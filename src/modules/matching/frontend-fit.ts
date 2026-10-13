export const FRONTEND_FIT_WEIGHTS = {
  title: 30,
  skills: 40,
  seniority: 15,
  compensation: 15,
} as const;

const USD_TO_CAD = 1.36;

const SENIORITY_LEVELS = ["intern", "junior", "mid", "senior", "staff"] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

const SENIORITY_RANK: Record<SeniorityLevel, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  staff: 4,
};

const SKILL_GROUPS: Array<{ id: string; label: string; points: number; patterns: RegExp[] }> = [
  { id: "react", label: "React", points: 10, patterns: [/\breact(?:\.js|js)?\b/i] },
  { id: "typescript", label: "TypeScript", points: 8, patterns: [/\btypescript\b/i] },
  { id: "next", label: "Next.js", points: 5, patterns: [/\bnext(?:\.js|js)\b/i] },
  {
    id: "css",
    label: "CSS/Tailwind",
    points: 5,
    patterns: [/\btailwind(?:\s*css)?\b/i, /\bcss\b/i, /\bscss\b/i, /\bcss-in-js\b/i],
  },
  {
    id: "a11y",
    label: "accessibility",
    points: 4,
    patterns: [/\bwcag\b/i, /\baccessibility\b/i, /\ba11y\b/i, /\baria\b/i],
  },
  {
    id: "testing",
    label: "testing",
    points: 4,
    patterns: [
      /\bplaywright\b/i,
      /\btesting library\b/i,
      /\bjest\b/i,
      /\bvitest\b/i,
      /\bcypress\b/i,
    ],
  },
  {
    id: "performance",
    label: "performance",
    points: 2,
    patterns: [/\bcore web vitals\b/i, /\bweb vitals\b/i, /\blighthouse\b/i, /\bweb performance\b/i],
  },
  {
    id: "design-system",
    label: "design systems",
    points: 2,
    patterns: [/\bdesign systems?\b/i, /\bcomponent library\b/i],
  },
];

const FRONTEND_TITLE =
  /\b(front[\s-]?end|ui engineer|ui developer|design engineer|web platform|react|typescript)\b/i;
const NEGATIVE_TITLE =
  /\b(back[\s-]?end|devops|site reliability|\bsre\b|data engineer|data scientist|machine learning|ml engineer|\bios\b|\bandroid\b|mobile engineer|sales|recruiter|account executive)\b/i;

export type FrontendFitJob = {
  title: string;
  description?: string | null;
  technologies?: string[] | null;
  requirements?: Array<{ text?: string | null; normalizedSkill?: string | null }>;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
};

export type FrontendFitProfile = {
  skills?: string[];
  targetTitles?: string[];
  preferredSeniority?: string | null;
  minimumSalaryCad?: number | null;
};

export type FrontendFitResult = {
  score: number;
  reasons: string[];
  breakdown: {
    title: number;
    skills: number;
    seniority: number;
    compensation: number;
  };
  skillHits: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSeniority(value: string | null | undefined): SeniorityLevel {
  const text = (value ?? "").toLowerCase();
  if (/\b(intern|internship|co-op|new grad)\b/.test(text)) return "intern";
  if (/\b(junior|jr\.?)\b/.test(text)) return "junior";
  if (/\b(staff|principal|distinguished)\b/.test(text)) return "staff";
  if (/\b(senior|sr\.?|lead)\b/.test(text)) return "senior";
  if (/\bmid(?:-level)?\b|\bintermediate\b/.test(text)) return "mid";
  if (SENIORITY_LEVELS.includes(text as SeniorityLevel)) return text as SeniorityLevel;
  return "senior";
}

function detectJobSeniority(title: string): SeniorityLevel | null {
  const text = title.toLowerCase();
  if (/\b(intern|internship|co-op|new grad)\b/.test(text)) return "intern";
  if (/\b(junior|jr\.?)\b/.test(text)) return "junior";
  if (/\b(staff|principal|distinguished)\b/.test(text)) return "staff";
  if (/\b(senior|sr\.?)\b/.test(text)) return "senior";
  if (/\b(lead|manager)\b/.test(text)) return "senior";
  if (/\b(mid|intermediate)\b/.test(text)) return "mid";
  return null;
}

function jobHaystack(job: FrontendFitJob): string {
  const requirementText = (job.requirements ?? [])
    .map((requirement) => `${requirement.normalizedSkill ?? ""} ${requirement.text ?? ""}`)
    .join(" ");
  const description = (job.description ?? "").slice(0, 4000);
  return [job.title, ...(job.technologies ?? []), requirementText, description].join("\n");
}

function scoreTitle(job: FrontendFitJob, profile: FrontendFitProfile): { points: number; reason: string } {
  const title = job.title.trim();
  const hasFrontend = FRONTEND_TITLE.test(title);
  const hasNegative = NEGATIVE_TITLE.test(title);
  let points = 8;
  let reason = "Title is only loosely related to frontend work";

  if (hasNegative && !hasFrontend) {
    return { points: 3, reason: "Title sits outside frontend roles" };
  }

  if (/\b(front[\s-]?end|ui)\s+(engineer|developer)\b/i.test(title) || /\bui engineer\b/i.test(title)) {
    points = 30;
    reason = "Title is a frontend or UI engineering role";
  } else if (/\bdesign engineer\b/i.test(title)) {
    points = 28;
    reason = "Title is a design engineer role";
  } else if (/\b(react|typescript)\s+(engineer|developer)\b/i.test(title)) {
    points = 28;
    reason = "Title is a React or TypeScript role";
  } else if (/\bweb platform\b/i.test(title)) {
    points = 26;
    reason = "Title is a web platform role";
  } else if (/\bweb (engineer|developer)\b/i.test(title)) {
    points = 24;
    reason = "Title is a web engineering role";
  } else if (/\bfull[\s-]?stack\b/i.test(title)) {
    points = hasFrontend ? 26 : 18;
    reason = hasFrontend
      ? "Full-stack title with an explicit frontend focus"
      : "Full-stack title; frontend depth depends on the stack";
  } else if (/\bproduct engineer\b/i.test(title)) {
    points = 16;
    reason = "Product engineer title can be frontend-leaning";
  } else if (/\bsoftware engineer\b/i.test(title)) {
    points = hasFrontend ? 26 : 12;
    reason = hasFrontend
      ? "Software engineer title calls out frontend work"
      : "Generic software engineer title";
  } else if (hasFrontend) {
    points = 24;
    reason = "Title mentions frontend skills";
  }

  const targetHit = (profile.targetTitles ?? []).find((target) => {
    const needle = target.trim().toLowerCase();
    return needle.length > 3 && title.toLowerCase().includes(needle);
  });
  if (targetHit) {
    points = Math.min(FRONTEND_FIT_WEIGHTS.title, points + 2);
    reason = `Close to your target title “${targetHit.trim()}”`;
  }

  return { points, reason };
}

function scoreSkills(job: FrontendFitJob, profile: FrontendFitProfile): {
  points: number;
  reason: string;
  hits: string[];
} {
  const haystack = jobHaystack(job);
  const hits = SKILL_GROUPS.filter((group) => group.patterns.some((pattern) => pattern.test(haystack)));
  let points = hits.reduce((sum, group) => sum + group.points, 0);
  const labels = hits.map((group) => group.label);
  const profileSkills = new Set((profile.skills ?? []).map((skill) => skill.toLowerCase()));
  const overlap = hits
    .filter((group) =>
      [...profileSkills].some(
        (skill) => skill.includes(group.id) || group.label.toLowerCase().includes(skill)
      )
    )
    .map((group) => group.label);

  const frontendTitle = FRONTEND_TITLE.test(job.title);
  if (frontendTitle && points < 12) {
    points = 12;
  }
  points = Math.min(FRONTEND_FIT_WEIGHTS.skills, points);

  if (labels.length === 0) {
    return {
      points,
      hits: [],
      reason: frontendTitle
        ? "Frontend title, with few stack details in the posting"
        : "Posting does not mention the frontend stack",
    };
  }

  const listed = labels.slice(0, 4).join(", ");
  const reason = overlap.length
    ? `${listed} — overlaps your profile`
    : `Mentions ${listed}`;
  return { points, hits: labels, reason };
}

function scoreSeniority(job: FrontendFitJob, profile: FrontendFitProfile): { points: number; reason: string } {
  const preferred = normalizeSeniority(profile.preferredSeniority);
  const detected = detectJobSeniority(job.title);
  if (!detected) {
    return {
      points: 11,
      reason: "Posting does not state a seniority level",
    };
  }
  const delta = Math.abs(SENIORITY_RANK[detected] - SENIORITY_RANK[preferred]);
  if (delta === 0) {
    return { points: 15, reason: `Seniority matches ${preferred}` };
  }
  if (delta === 1) {
    return { points: 10, reason: `${detected} is one level from your ${preferred} target` };
  }
  if (delta === 2) {
    return { points: 5, reason: `${detected} is a stretch from your ${preferred} target` };
  }
  return { points: 2, reason: `${detected} is far from your ${preferred} target` };
}

function currencyKind(currency: string | null | undefined): "cad" | "usd" | "other" | "unknown" {
  const value = (currency ?? "").trim().toLowerCase();
  if (!value || value === "cad" || value === "c$") return "cad";
  if (value === "usd" || value === "us$" || value === "$") return "usd";
  return "other";
}

function offeredAmount(job: FrontendFitJob): number | null {
  const max = job.salaryMax ?? null;
  const min = job.salaryMin ?? null;
  if (max == null && min == null) return null;
  return max ?? min;
}

function scoreCompensation(
  job: FrontendFitJob,
  profile: FrontendFitProfile
): { points: number; reason: string } {
  const offered = offeredAmount(job);
  if (offered == null) {
    return { points: 8, reason: "Compensation is not listed" };
  }

  const kind = currencyKind(job.salaryCurrency);
  if (kind === "other") {
    return { points: 6, reason: "Compensation is listed in a currency other than CAD" };
  }

  const cad = kind === "usd" ? Math.round(offered * USD_TO_CAD) : offered;
  const minimum = profile.minimumSalaryCad ?? null;
  const prefix = kind === "usd" ? `USD listing is about CAD ${cad.toLocaleString("en-CA")}` : "CAD range";

  if (minimum == null || minimum <= 0) {
    return {
      points: kind === "usd" ? 10 : 12,
      reason: kind === "usd" ? `${prefix} (no CAD minimum set)` : "Compensation is listed in CAD",
    };
  }

  if (cad >= minimum) {
    return {
      points: kind === "usd" ? 12 : 15,
      reason: `${prefix} meets your CAD ${minimum.toLocaleString("en-CA")} minimum`,
    };
  }

  const ratio = cad / minimum;
  const points = clamp(Math.round((kind === "usd" ? 12 : 15) * ratio), 2, kind === "usd" ? 8 : 8);
  return {
    points,
    reason: `${prefix} is below your CAD ${minimum.toLocaleString("en-CA")} minimum`,
  };
}

export function scoreFrontendFit(
  job: FrontendFitJob,
  profile: FrontendFitProfile = {}
): FrontendFitResult {
  const title = scoreTitle(job, profile);
  const skills = scoreSkills(job, profile);
  const seniority = scoreSeniority(job, profile);
  const compensation = scoreCompensation(job, profile);
  const breakdown = {
    title: title.points,
    skills: skills.points,
    seniority: seniority.points,
    compensation: compensation.points,
  };
  const score = clamp(
    breakdown.title + breakdown.skills + breakdown.seniority + breakdown.compensation,
    0,
    100
  );

  return {
    score,
    reasons: [title.reason, skills.reason, seniority.reason, compensation.reason],
    breakdown,
    skillHits: skills.hits,
  };
}
