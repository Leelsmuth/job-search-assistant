import { extractTechnologies } from "@/modules/ingestion/extract-requirements";

type SkillCategory =
  | "language"
  | "framework"
  | "library"
  | "testing"
  | "platform"
  | "architecture"
  | "accessibility"
  | "performance"
  | "process"
  | "domain";

const CATEGORY_MAP: Record<string, SkillCategory> = {
  language: "language",
  languages: "language",
  framework: "framework",
  frameworks: "framework",
  library: "library",
  libraries: "library",
  testing: "testing",
  test: "testing",
  platform: "platform",
  architecture: "architecture",
  accessibility: "accessibility",
  a11y: "accessibility",
  performance: "performance",
  process: "process",
  domain: "domain",
};

const NAME_TO_CATEGORY: Record<string, SkillCategory> = {
  react: "framework",
  "next.js": "framework",
  nextjs: "framework",
  typescript: "language",
  javascript: "language",
  node: "platform",
  "node.js": "platform",
  graphql: "architecture",
  playwright: "testing",
  vitest: "testing",
  tailwind: "framework",
  redux: "library",
  zustand: "library",
  firebase: "platform",
};

export function normalizeSkillCategory(category?: string, skillName?: string): SkillCategory {
  if (category) {
    const key = category.toLowerCase().trim();
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  }
  if (skillName) {
    const key = skillName.toLowerCase().trim();
    if (NAME_TO_CATEGORY[key]) return NAME_TO_CATEGORY[key];
  }
  return "domain";
}

export function extractEvidenceSkills(text: string): string[] {
  return extractTechnologies(text);
}
