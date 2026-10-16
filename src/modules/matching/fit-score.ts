import { extractCanonicalSkills } from "@/modules/candidate/skill-dictionary";
import { sanitizeSkills } from "@/modules/candidate/sanitize-skills";
import {
  classifyLocationEligibility,
  type LocationClass,
  type LocationEligibility,
  type LocationFlag,
} from "@/modules/location/eligibility";

export const FIT_COMPONENT_MAX = {
  role: 40,
  stack: 35,
  seniority: 15,
  pay: 8,
} as const;

/** This assistant is for one candidate with about six years of experience. */
export const DEFAULT_CANDIDATE_YEARS = 6;

const USD_TO_CAD = 1.36;

const FRONTEND_CORE = new Set([
  "React",
  "TypeScript",
  "JavaScript",
  "Next.js",
  "CSS",
  "HTML",
  "Tailwind CSS",
]);

const PENALTY_FAMILIES: Array<{ label: string; skills: string[]; title: RegExp }> = [
  { label: "Java/Spring", skills: ["Java", "Spring"], title: /\bjava\b(?!script)|\bspring\b/i },
  { label: ".NET/C#", skills: ["C#", ".NET"], title: /\bc#\b|\.net\b|\bdotnet\b|\bcsharp\b/i },
  { label: "iOS/Swift", skills: ["Swift", "iOS"], title: /\bios\b|\bswift\b/i },
  { label: "Android/Kotlin", skills: ["Kotlin", "Android"], title: /\bandroid\b|\bkotlin\b/i },
  { label: "React Native", skills: ["React Native"], title: /\breact[\s-]*native\b/i },
  { label: "ServiceNow", skills: ["ServiceNow"], title: /\bservicenow\b/i },
];

const NON_ENGINEERING: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "product management",
    pattern: /\b(?:product|project|program)\s+manager\b|\bproduct\s+owner\b|\bscrum\s+master\b/i,
  },
  {
    label: "design",
    pattern: /\b(?:ux|ui|product|visual|graphic|web)\s+designer\b|\bdesigner\b/i,
  },
  { label: "analysis", pattern: /\banalyst\b/i },
  {
    label: "data",
    pattern: /\bdata\s+(?:architect|engineer|scientist|analyst|platform)\b/i,
  },
  {
    label: "security",
    pattern: /\b(?:cyber\s*security|information security|infosec|appsec|security engineer|security analyst)\b/i,
  },
  {
    label: "sales",
    pattern: /\b(?:sales|account executive|business development)\b/i,
  },
  {
    label: "customer experience",
    pattern: /\b(?:customer experience|customer success|\bcx\b)\b/i,
  },
];

export type FitComponentId = "role" | "stack" | "seniority" | "pay";

export type FitComponent = {
  id: FitComponentId;
  label: string;
  score: number;
  max: number;
  reason: string;
};

export type FitBreakdown = {
  role: { score: number; max: number; reason: string };
  stack: { score: number; max: number; reason: string };
  seniority: { score: number; max: number; reason: string };
  pay: { score: number; max: number; reason: string };
};

export type FitJob = {
  title: string;
  description?: string | null;
  location?: string | null;
  workplaceType?: string | null;
  technologies?: string[] | null;
  requirements?: Array<{ text?: string | null; normalizedSkill?: string | null }>;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
};

export type FitProfile = {
  skills?: string[] | null;
  yearsExperience?: number | null;
  minimumSalaryCad?: number | null;
  targetTitles?: string[] | null;
};

export type JobFitResult = {
  score: number;
  eligible: boolean;
  ineligibleReason: string | null;
  reasons: string[];
  breakdown: FitBreakdown;
  components: FitComponent[];
  skillHits: string[];
  missingCoreStacks: string[];
  location: LocationEligibility;
};

const ELIGIBLE_LOCATIONS = new Set<LocationClass>(["remote_canada", "hybrid_gta", "onsite_gta"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function nonEngineeringReason(title: string): string | null {
  if (/\bdesign\s+engineer\b/i.test(title)) return null;
  const hit = NON_ENGINEERING.find((entry) => entry.pattern.test(title));
  if (!hit) return null;
  return `Not an engineering role (${hit.label})`;
}

function hasReactNative(text: string): boolean {
  return /\breact[\s-]*native\b/i.test(text);
}

function hasReactWeb(text: string): boolean {
  const stripped = text.replace(/\breact[\s-]*native\b/gi, " ");
  return /\breact(?:\.js|js)?\b/i.test(stripped);
}

function hasFrontendTitle(title: string): boolean {
  return /\b(front[\s-]?end|ui engineer|ui developer)\b/i.test(title);
}

function scoreRole(title: string, haystack: string): { score: number; reason: string } {
  const max = FIT_COMPONENT_MAX.role;
  if (nonEngineeringReason(title)) {
    return { score: 0, reason: "Title is not an engineering role" };
  }
  if (hasReactNative(title) || /\bmobile\s+(developer|engineer)\b/i.test(title)) {
    return { score: 4, reason: "Mobile / React Native title, not web frontend" };
  }
  if (/\b(ios|android|swift|kotlin)\s+(developer|engineer)\b/i.test(title)) {
    return { score: 4, reason: "Native mobile title, not web frontend" };
  }
  if (/\b(sdet|qa engineer|quality engineer|test engineer|software development engineer in test)\b/i.test(title)) {
    return { score: 3, reason: "SDET / QA title, not a product frontend role" };
  }
  if (/\b(ai|ml|machine[\s-]?learning)\s+(engineer|scientist)\b/i.test(title)) {
    return { score: 4, reason: "AI / ML title, not web frontend" };
  }
  if (/\bback[\s-]?end\b/i.test(title) && !hasFrontendTitle(title) && !hasReactWeb(title)) {
    return { score: 4, reason: "Backend title" };
  }
  if (/\bdesign\s+engineer\b/i.test(title)) {
    return { score: 16, reason: "Design engineer title is adjacent to frontend, not a product UI role" };
  }
  if (hasFrontendTitle(title)) {
    return { score: max, reason: "Title is a frontend or UI engineering role" };
  }
  if (/\bfull[\s-]?stack\b/i.test(title)) {
    const frontend = hasReactWeb(title) || hasFrontendTitle(haystack) || hasReactWeb(haystack);
    const foreign = PENALTY_FAMILIES.some((family) => family.title.test(title) && family.label !== "React Native");
    if (frontend && !foreign) {
      return { score: 28, reason: "Full-stack title with frontend work in the posting" };
    }
    if (foreign) {
      return { score: 8, reason: "Full-stack title built on a stack outside web frontend" };
    }
    return { score: 12, reason: "Full-stack title without a clear frontend stack" };
  }
  if (hasReactWeb(title) || /\btypescript\b/i.test(title)) {
    return { score: 34, reason: "Title is a React or TypeScript web role" };
  }
  if (/\b(software engineer|software developer|\bswe\b)\b/i.test(title)) {
    if (hasFrontendTitle(title) || hasReactWeb(title) || /\bfrontend\b/i.test(title)) {
      return { score: max, reason: "Software engineer title calls out frontend work" };
    }
    return { score: 8, reason: "Generic software engineer title" };
  }
  if (hasReactWeb(haystack) && /\b(engineer|developer)\b/i.test(title)) {
    return { score: 22, reason: "Engineering title with React in the posting" };
  }
  return { score: 0, reason: "Title does not match frontend or full-stack web work" };
}

function jobSkillText(job: FitJob): string {
  const requirements = (job.requirements ?? [])
    .map((requirement) => `${requirement.normalizedSkill ?? ""} ${requirement.text ?? ""}`)
    .join(" ");
  const description = (job.description ?? "").slice(0, 4000);
  return [job.title, ...(job.technologies ?? []), requirements, description].join("\n");
}

function scoreStack(
  job: FitJob,
  candidateSkills: Set<string>
): { score: number; reason: string; hits: string[]; missing: string[] } {
  const text = jobSkillText(job);
  const jobSkills = extractCanonicalSkills(text);
  const hits = jobSkills.filter((skill) => candidateSkills.has(skill));
  const missingFamilies = PENALTY_FAMILIES.filter(
    (family) =>
      family.skills.some((skill) => jobSkills.includes(skill)) &&
      family.skills.every((skill) => !candidateSkills.has(skill))
  );
  const titlePenalty = missingFamilies.some((family) => family.title.test(job.title));

  if (jobSkills.length === 0) {
    return {
      score: 0,
      hits: [],
      missing: missingFamilies.map((family) => family.label),
      reason: "Posting does not name a recognizable tech stack",
    };
  }

  const ratio = hits.length / jobSkills.length;
  const coreHits = hits.filter((skill) => FRONTEND_CORE.has(skill)).length;
  let points = Math.round(ratio * 28) + Math.min(12, coreHits * 4);
  points = Math.min(FIT_COMPONENT_MAX.stack, points);
  if (missingFamilies.length > 0) {
    points -= titlePenalty ? 20 : 10 * missingFamilies.length;
  }
  points = clamp(points, 0, FIT_COMPONENT_MAX.stack);
  if (titlePenalty) points = Math.min(points, 4);

  const missing = missingFamilies.map((family) => family.label);
  const listed = hits.slice(0, 4).join(", ");
  let reason: string;
  if (hits.length === 0 && missing.length === 0) {
    reason = "No overlap with your skills";
  } else if (missing.length > 0 && hits.length === 0) {
    reason = `Core stack you don't have: ${missing.join(", ")}`;
  } else if (missing.length > 0) {
    reason = listed
      ? `${listed} overlap, but the role leans on ${missing.join(", ")}`
      : `Role leans on ${missing.join(", ")}`;
  } else {
    reason = `${listed} overlap your skills`;
  }

  return { score: points, reason, hits, missing };
}

function requiredYears(description: string | null | undefined): number | null {
  const text = description ?? "";
  const matches = [...text.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs)\b/gi)];
  const years = matches
    .map((match) => Number.parseInt(match[1] ?? "", 10))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 30);
  if (years.length === 0) return null;
  return Math.max(...years);
}

type Level = "intern" | "junior" | "mid" | "senior" | "lead" | "staff" | "manager" | null;

function titleLevel(title: string): Level {
  const text = title.toLowerCase();
  if (/\b(intern|internship|co-op|new grad)\b/.test(text)) return "intern";
  if (/\b(junior|jr\.?)\b/.test(text)) return "junior";
  if (/\b(director|manager)\b/.test(text)) return "manager";
  if (/\b(staff|principal|distinguished)\b/.test(text)) return "staff";
  if (/\b(lead)\b/.test(text)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(text)) return "senior";
  if (/\b(mid|intermediate)\b/.test(text)) return "mid";
  return null;
}

function scoreSeniority(job: FitJob, yearsExperience: number): { score: number; reason: string } {
  const level = titleLevel(job.title);
  const years = requiredYears(job.description);
  const max = FIT_COMPONENT_MAX.seniority;

  if (level === "intern") return { score: 0, reason: "Intern title is below your experience" };
  if (level === "junior") return { score: 1, reason: "Junior title is below your experience" };
  if (level === "manager") return { score: 0, reason: "Manager or director title is outside an IC frontend role" };
  if (level === "staff") {
    const points = yearsExperience >= 10 ? 6 : 3;
    return {
      score: points,
      reason: `Staff / principal is a stretch at about ${yearsExperience} years`,
    };
  }

  if (level === "senior" || level === "lead") {
    let points = yearsExperience >= 4 && yearsExperience <= 9 ? max : 8;
    if (level === "lead") points = Math.min(points, 12);
    if (years != null && years >= yearsExperience + 2) {
      points = Math.min(points, 6);
      return {
        score: points,
        reason: `Title is ${level}, and the posting asks for ${years}+ years`,
      };
    }
    return {
      score: points,
      reason:
        level === "senior"
          ? `Senior title fits about ${yearsExperience} years`
          : `Lead title is close to your ${yearsExperience} years`,
    };
  }

  if (level === "mid") {
    return { score: 8, reason: "Mid-level title is a step below your experience" };
  }

  if (years == null) {
    return { score: 0, reason: "Posting does not state a seniority level" };
  }
  if (years <= 2) return { score: 1, reason: `Posting asks for ${years}+ years` };
  if (years >= yearsExperience + 4) {
    return { score: 3, reason: `Posting asks for ${years}+ years, above your ${yearsExperience}` };
  }
  if (years <= yearsExperience + 1) {
    return { score: 12, reason: `${years}+ years lines up with your ${yearsExperience} years` };
  }
  return { score: 6, reason: `Posting asks for ${years}+ years` };
}

function currencyKind(currency: string | null | undefined): "cad" | "usd" | "other" {
  const value = (currency ?? "").trim().toLowerCase();
  if (!value || value === "cad" || value === "c$" || value === "cdn") return "cad";
  if (value === "usd" || value === "us$" || value === "$") return "usd";
  return "other";
}

function scorePay(job: FitJob, minimum: number | null): { score: number; reason: string } {
  const offered = job.salaryMax ?? job.salaryMin ?? null;
  if (offered == null) return { score: 0, reason: "Compensation is not listed" };
  const kind = currencyKind(job.salaryCurrency);
  if (kind === "other") return { score: 0, reason: "Compensation is not in CAD or USD" };
  const cad = kind === "usd" ? Math.round(offered * USD_TO_CAD) : offered;
  const prefix = kind === "usd" ? `USD listing is about CAD ${cad.toLocaleString("en-CA")}` : "Listed CAD pay";
  if (minimum == null || minimum <= 0) {
    return { score: 0, reason: `${prefix} is listed, and no minimum is set` };
  }
  if (cad >= minimum) {
    return {
      score: FIT_COMPONENT_MAX.pay,
      reason: `${prefix} meets your CAD ${minimum.toLocaleString("en-CA")} minimum`,
    };
  }
  const ratio = cad / minimum;
  const score = clamp(Math.round((ratio - 1) * 12), -10, 0);
  return {
    score,
    reason: `${prefix} is below your CAD ${minimum.toLocaleString("en-CA")} minimum`,
  };
}

function component(id: FitComponentId, label: string, score: number, max: number, reason: string): FitComponent {
  return { id, label, score, max, reason };
}

export function scoreJobFit(job: FitJob, profile: FitProfile = {}, gtaCities?: string[]): JobFitResult {
  const location = classifyLocationEligibility(job, { gtaCities });
  const roleGate = nonEngineeringReason(job.title);
  const locationOk = ELIGIBLE_LOCATIONS.has(location.class);
  const eligible = !roleGate && locationOk;
  const ineligibleReason = roleGate ?? (locationOk ? null : location.reason);

  const candidateSkills = new Set(sanitizeSkills(profile.skills ?? []));
  const years = profile.yearsExperience ?? DEFAULT_CANDIDATE_YEARS;
  const haystack = jobSkillText(job);
  const role = scoreRole(job.title, haystack);
  let roleScore = role.score;
  const level = titleLevel(job.title);
  if (level === "intern" || level === "junior" || level === "manager") {
    roleScore = Math.min(roleScore, level === "manager" ? 6 : 8);
  }

  const stack = scoreStack(job, candidateSkills);
  const seniority = scoreSeniority(job, years);
  const pay = scorePay(job, profile.minimumSalaryCad ?? null);

  const components: FitComponent[] = [
    component("role", "Role", roleScore, FIT_COMPONENT_MAX.role, role.reason),
    component("stack", "Tech stack", stack.score, FIT_COMPONENT_MAX.stack, stack.reason),
    component("seniority", "Seniority", seniority.score, FIT_COMPONENT_MAX.seniority, seniority.reason),
    component("pay", "Pay", pay.score, FIT_COMPONENT_MAX.pay, pay.reason),
  ];
  const score = clamp(
    components.reduce((sum, item) => sum + item.score, 0),
    0,
    100
  );

  const breakdown: FitBreakdown = {
    role: { score: roleScore, max: FIT_COMPONENT_MAX.role, reason: role.reason },
    stack: { score: stack.score, max: FIT_COMPONENT_MAX.stack, reason: stack.reason },
    seniority: { score: seniority.score, max: FIT_COMPONENT_MAX.seniority, reason: seniority.reason },
    pay: { score: pay.score, max: FIT_COMPONENT_MAX.pay, reason: pay.reason },
  };

  return {
    score,
    eligible,
    ineligibleReason,
    reasons: components.map((item) => item.reason),
    breakdown,
    components,
    skillHits: stack.hits,
    missingCoreStacks: stack.missing,
    location,
  };
}

export function isFitBreakdown(value: unknown): value is FitBreakdown {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<FitBreakdown>;
  return Boolean(record.role && record.stack && record.seniority && record.pay);
}

export type FitSnapshot = {
  fitScore: number;
  fitBreakdown: FitBreakdown;
  fitEligible: boolean;
  fitIneligibleReason: string | null;
  frontendFitScore: number;
  frontendFitReasons: string[];
  locationEligibility: LocationClass;
  locationFlags: LocationFlag[];
};

export function fitSnapshot(result: JobFitResult): FitSnapshot {
  return {
    fitScore: result.score,
    fitBreakdown: result.breakdown,
    fitEligible: result.eligible,
    fitIneligibleReason: result.ineligibleReason,
    frontendFitScore: result.score,
    frontendFitReasons: result.reasons,
    locationEligibility: result.location.class,
    locationFlags: result.location.flags,
  };
}
