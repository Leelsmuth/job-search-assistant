import { tokenize } from "@/modules/documents/text";
import type { ProfileSnapshot } from "@/modules/documents/types";

const TECH_TERMS = [
  "react native",
  "next.js",
  "node.js",
  "react.js",
  "tailwind css",
  "github actions",
  "react",
  "typescript",
  "javascript",
  "graphql",
  "kubernetes",
  "k8s",
  "docker",
  "terraform",
  "python",
  "java",
  "golang",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "scala",
  "vue",
  "angular",
  "svelte",
  "redux",
  "webpack",
  "vite",
  "jest",
  "vitest",
  "cypress",
  "playwright",
  "storybook",
  "figma",
  "sass",
  "scss",
  "tailwind",
  "bootstrap",
  "nestjs",
  "django",
  "flask",
  "rails",
  "kafka",
  "redis",
  "mongodb",
  "mysql",
  "postgresql",
  "postgres",
  "elasticsearch",
  "firebase",
  "supabase",
  "prisma",
  "drizzle",
  "aws",
  "gcp",
  "azure",
  "html",
  "css",
  "sveltekit",
  "remix",
  "astro",
  "webpack",
  "three.js",
  "d3.js",
  "electron",
  "grpc",
  "protobuf",
  "snowflake",
  "spark",
  "hadoop",
  "tensorflow",
  "pytorch",
  "pandas",
  "numpy",
  "laravel",
  "wordpress",
  "salesforce",
  "tableau",
  "datadog",
  "sentry",
  "nginx",
  "linux",
  "git",
  "github",
  "gitlab",
  "jenkins",
  "circleci",
  "babel",
  "eslint",
  "prettier",
  "chakra",
  "material ui",
  "apollo",
  "trpc",
  "c#",
  "c++",
] as const;

const ORG_STOP = new Set([
  "the", "this", "that", "team", "role", "product", "design", "engineering",
  "frontend", "backend", "senior", "staff", "junior", "lead", "hiring",
  "manager", "canada", "toronto", "ontario", "remote", "hybrid", "greater",
  "area", "user", "web", "dear", "sincerely", "hello", "regards", "gta",
  "canadian", "english", "application", "posting", "interfaces", "interface",
]);

const TITLE_SOURCE =
  "\\b((?:senior|staff|principal|lead|junior|intern)\\s+)?(?:front[\\s-]?end|back[\\s-]?end|full[\\s-]?stack|software|web|ui|ux)\\s+(?:engineer|developer|designer)\\b";
const ROLE_SOURCE =
  "\\b(?:staff|principal|director|senior|junior|lead|intern)\\s+(?:engineer|developer|designer|manager)\\b";
const ORG_SOURCE =
  "\\b(?:at|with|for)\\s+([A-Z][A-Za-z0-9&'’-]+(?:\\s+[A-Z][A-Za-z0-9&'’-]+){0,3})";
const LEGAL_ORG_SOURCE =
  "\\b([A-Z][A-Za-z0-9&.'’-]+(?:\\s+[A-Z][A-Za-z0-9&.'’-]+){0,3})\\s+(?:Inc\\.?|Ltd\\.?|Corp\\.?|LLC|GmbH)\\b";

export type BulletEvidence = {
  bullet: string;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  otherCompanies?: string[];
};

export type GroundingReview = {
  grounded: boolean;
  text: string;
  unsupportedClaims: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsTerm(text: string, term: string): boolean {
  const escaped = escapeRegExp(term.trim());
  if (!escaped) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function findTechMentions(text: string): string[] {
  return TECH_TERMS.filter((term) => containsTerm(text, term));
}

function isTechPhrase(phrase: string): boolean {
  return findTechMentions(phrase).some((term) => term.toLowerCase() === phrase.toLowerCase());
}

function significantNumbers(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0]);
}

function claim(prefix: string, value: string): string {
  const detail = value.replace(/\s+/g, " ").trim();
  return `${prefix}: "${detail.slice(0, 80)}${detail.length > 80 ? "…" : ""}"`;
}

export function reviewBulletRewrite(suggested: string, source: BulletEvidence): GroundingReview {
  const original = source.bullet.trim();
  const next = suggested.trim();
  if (!next) {
    return {
      grounded: false,
      text: original,
      unsupportedClaims: ["Rewrite was empty, so the original bullet was kept."],
    };
  }
  if (next === original) {
    return { grounded: true, text: original, unsupportedClaims: [] };
  }

  const claims: string[] = [];
  const originalTokens = new Set(tokenize(original));
  if (originalTokens.size > 0) {
    let overlap = 0;
    const suggestedTokens = new Set(tokenize(next));
    for (const token of originalTokens) {
      if (suggestedTokens.has(token)) overlap += 1;
    }
    if (overlap / originalTokens.size < 0.3) {
      claims.push("Rewrite does not stay close to the original bullet.");
    }
  }

  const allowedNumbers = new Set(significantNumbers(original));
  const dateNumbers = new Set(significantNumbers(`${source.startDate ?? ""} ${source.endDate ?? ""}`));
  for (const value of significantNumbers(next)) {
    const yearInRole = /^\d{4}$/.test(value) && dateNumbers.has(value);
    if (!allowedNumbers.has(value) && !yearInRole) {
      claims.push(claim("Metric or number is not in this bullet", value));
    }
  }

  for (const term of findTechMentions(next)) {
    if (!containsTerm(original, term)) {
      claims.push(claim("Skill is not in this bullet", term));
    }
  }

  const allowedCompanies = [source.company, ...(source.otherCompanies ?? [])].filter(Boolean);
  for (const company of source.otherCompanies ?? []) {
    if (containsTerm(next, company) && !containsTerm(original, company) && !containsTerm(source.company, company)) {
      claims.push(claim("Employer is not this role", company));
    }
  }

  for (const phrase of organizationPhrases(next)) {
    const allowed =
      containsTerm(original, phrase) ||
      allowedCompanies.some((company) => company.toLowerCase() === phrase.toLowerCase());
    if (!allowed) {
      claims.push(claim("Employer is not in this bullet", phrase));
    }
  }

  const titleBlob = `${source.title}\n${original}`;
  for (const match of next.matchAll(new RegExp(`${TITLE_SOURCE}|${ROLE_SOURCE}`, "gi"))) {
    const phrase = match[0].trim();
    if (!containsTerm(titleBlob, phrase)) {
      claims.push(claim("Job title is not this role", phrase));
    }
  }

  if (claims.length > 0) {
    return { grounded: false, text: original, unsupportedClaims: unique(claims).slice(0, 8) };
  }
  return { grounded: true, text: next, unsupportedClaims: [] };
}

function organizationPhrases(text: string): string[] {
  const found: string[] = [];
  for (const pattern of [new RegExp(ORG_SOURCE, "g"), new RegExp(LEGAL_ORG_SOURCE, "g")]) {
    for (const match of text.matchAll(pattern)) {
      const phrase = match[1]?.trim().replace(/[.,;:]+$/g, "");
      if (!phrase) continue;
      const words = phrase.split(/\s+/);
      if (words.every((word) => ORG_STOP.has(word.toLowerCase()) || isTechPhrase(word))) continue;
      if (isTechPhrase(phrase)) continue;
      found.push(phrase);
    }
  }
  return unique(found);
}

export function profileCorpus(profile: ProfileSnapshot): string {
  return [
    profile.displayName,
    profile.location,
    profile.summary,
    profile.yearsExperience != null ? String(profile.yearsExperience) : null,
    ...profile.targetTitles,
    ...profile.skills.map((skill) => skill.name),
    ...profile.experiences.flatMap((experience) => [
      experience.company,
      experience.title,
      experience.startDate,
      experience.endDate,
      experience.location,
      experience.description,
      ...experience.bullets.flatMap((bullet) => [bullet.text, bullet.impact, ...bullet.skills]),
    ]),
    ...profile.projects.flatMap((project) => [
      project.name,
      project.description,
      project.evidence,
      ...project.skills,
    ]),
    ...profile.education.flatMap((item) => [
      item.institution,
      item.degree,
      item.field,
      item.startDate,
      item.endDate,
    ]),
    ...profile.certifications.flatMap((item) => [item.name, item.issuer]),
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n");
}

export function reviewCoverLetter(
  letter: string,
  corpus: string,
  options?: {
    organizations?: string[];
    jobTitle?: string | null;
    titles?: string[];
  }
): { grounded: boolean; unsupportedClaims: string[] } {
  const claims: string[] = [];
  const organizations = options?.organizations ?? [];
  const titleBlob = [options?.jobTitle ?? "", ...(options?.titles ?? []), corpus]
    .join("\n")
    .toLowerCase();

  for (const term of findTechMentions(letter)) {
    if (!containsTerm(corpus, term)) {
      claims.push(claim("Skill is not in the profile", term));
    }
  }

  for (const value of significantNumbers(letter)) {
    if (!containsTerm(corpus, value)) {
      claims.push(claim("Metric or number is not in the profile", value));
    }
  }

  for (const word of ["doubled", "tripled", "quadrupled"]) {
    if (containsTerm(letter, word) && !containsTerm(corpus, word)) {
      claims.push(claim("Metric is not in the profile", word));
    }
  }

  for (const phrase of organizationPhrases(letter)) {
    const allowed = organizations.some((org) => org.toLowerCase() === phrase.toLowerCase());
    if (!allowed && !containsTerm(corpus, phrase)) {
      claims.push(claim("Employer is not in the profile", phrase));
    }
  }

  for (const match of letter.matchAll(new RegExp(`${TITLE_SOURCE}|${ROLE_SOURCE}`, "gi"))) {
    const phrase = match[0].trim().toLowerCase();
    if (!titleBlob.includes(phrase)) {
      claims.push(claim("Job title is not in the profile or posting", match[0].trim()));
    }
  }

  const unsupportedClaims = unique(claims).slice(0, 8);
  return { grounded: unsupportedClaims.length === 0, unsupportedClaims };
}
