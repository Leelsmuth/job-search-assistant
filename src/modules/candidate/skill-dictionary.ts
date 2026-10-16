export type CanonicalSkillCategory =
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

export type CanonicalSkill = {
  name: string;
  category: CanonicalSkillCategory;
  /** Tested against the raw text. More specific entries must be listed first. */
  pattern: RegExp;
};

/**
 * Canonical tech skills. Anything that does not match is discarded by the sanitizer
 * (resume sentences, company names, bullet fragments).
 * React Native is listed before React so "React Native" is not treated as React web.
 */
export const CANONICAL_SKILLS: CanonicalSkill[] = [
  { name: "React Native", category: "framework", pattern: /\breact[\s-]*native\b/i },
  { name: "Next.js", category: "framework", pattern: /\bnext(?:\.js|js)\b/i },
  { name: "Node.js", category: "platform", pattern: /\bnode(?:\.js|js)\b/i },
  { name: "React", category: "framework", pattern: /\breact(?:\.js|js)?\b(?![\s-]*native)/i },
  { name: "TypeScript", category: "language", pattern: /\btypescript\b|\bts\b/i },
  { name: "JavaScript", category: "language", pattern: /\bjavascript\b|\bjs\b/i },
  { name: "HTML", category: "language", pattern: /\bhtml5?\b/i },
  { name: "CSS", category: "language", pattern: /\bcss3?\b|\bscss\b|\bsass\b/i },
  { name: "Tailwind CSS", category: "framework", pattern: /\btailwind(?:\s*css)?\b/i },
  { name: "Vue", category: "framework", pattern: /\bvue(?:\.js|js)?\b/i },
  { name: "Angular", category: "framework", pattern: /\bangular(?:js)?\b/i },
  { name: "Svelte", category: "framework", pattern: /\bsvelte(?:kit)?\b/i },
  { name: "Redux", category: "library", pattern: /\bredux\b/i },
  { name: "Zustand", category: "library", pattern: /\bzustand\b/i },
  { name: "TanStack Query", category: "library", pattern: /\b(tanstack query|react query)\b/i },
  { name: "GraphQL", category: "architecture", pattern: /\bgraphql\b/i },
  { name: "REST", category: "architecture", pattern: /\brestful\b|\brest apis?\b/i },
  { name: "Webpack", category: "platform", pattern: /\bwebpack\b/i },
  { name: "Vite", category: "platform", pattern: /\bvite\b/i },
  { name: "Jest", category: "testing", pattern: /\bjest\b/i },
  { name: "Vitest", category: "testing", pattern: /\bvitest\b/i },
  { name: "Playwright", category: "testing", pattern: /\bplaywright\b/i },
  { name: "Cypress", category: "testing", pattern: /\bcypress\b/i },
  { name: "Testing Library", category: "testing", pattern: /\btesting library\b/i },
  { name: "Selenium", category: "testing", pattern: /\bselenium\b/i },
  { name: "Accessibility", category: "accessibility", pattern: /\baccessibility\b|\ba11y\b|\bwcag\b|\baria\b/i },
  { name: "Web Performance", category: "performance", pattern: /\bweb performance\b|\bcore web vitals\b|\blighthouse\b/i },
  { name: "Design Systems", category: "domain", pattern: /\bdesign systems?\b/i },
  { name: "Storybook", category: "platform", pattern: /\bstorybook\b/i },
  { name: "Git", category: "process", pattern: /\bgit\b/i },
  { name: "Java", category: "language", pattern: /\bjava\b(?!script)/i },
  { name: "Spring", category: "framework", pattern: /\bspring(?:\s*boot)?\b/i },
  { name: "C#", category: "language", pattern: /\bc#\b|\bc sharp\b|\bcsharp\b/i },
  { name: ".NET", category: "framework", pattern: /\.net\b|\bdotnet\b|\basp\.net\b/i },
  { name: "Swift", category: "language", pattern: /\bswift(?:ui)?\b/i },
  { name: "iOS", category: "platform", pattern: /\bios\b/i },
  { name: "Kotlin", category: "language", pattern: /\bkotlin\b/i },
  { name: "Android", category: "platform", pattern: /\bandroid\b/i },
  { name: "ServiceNow", category: "platform", pattern: /\bservicenow\b/i },
  { name: "Python", category: "language", pattern: /\bpython\b/i },
  { name: "Go", category: "language", pattern: /\bgolang\b/i },
  { name: "Rust", category: "language", pattern: /\brust\b/i },
  { name: "Ruby", category: "language", pattern: /\bruby\b/i },
  { name: "PHP", category: "language", pattern: /\bphp\b/i },
  { name: "AWS", category: "platform", pattern: /\baws\b|\bamazon web services\b/i },
  { name: "GCP", category: "platform", pattern: /\bgcp\b|\bgoogle cloud\b/i },
  { name: "Azure", category: "platform", pattern: /\bazure\b/i },
  { name: "Docker", category: "platform", pattern: /\bdocker\b/i },
  { name: "Kubernetes", category: "platform", pattern: /\bkubernetes\b|\bk8s\b/i },
  { name: "PostgreSQL", category: "platform", pattern: /\bpostgres(?:ql)?\b/i },
  { name: "MongoDB", category: "platform", pattern: /\bmongodb\b/i },
  { name: "Redis", category: "platform", pattern: /\bredis\b/i },
  { name: "Firebase", category: "platform", pattern: /\bfirebase\b/i },
  { name: "Figma", category: "domain", pattern: /\bfigma\b/i },
];

const BY_NAME = new Map(CANONICAL_SKILLS.map((skill) => [skill.name.toLowerCase(), skill]));

export function canonicalSkill(name: string): CanonicalSkill | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

export function categoryForCanonicalSkill(name: string): CanonicalSkillCategory {
  return canonicalSkill(name)?.category ?? "domain";
}

/** Pull dictionary skills out of free text. Company names and sentences contribute nothing. */
export function extractCanonicalSkills(text: string): string[] {
  const found: string[] = [];
  for (const skill of CANONICAL_SKILLS) {
    if (skill.pattern.test(text)) found.push(skill.name);
  }
  return found;
}
