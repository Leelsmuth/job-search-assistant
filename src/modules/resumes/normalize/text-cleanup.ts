const ZERO_WIDTH = /[\u180E\u200B-\u200D\u200E\u200F\u2060\uFEFF]/g;

const SKILL_DICTIONARY = [
  "javascript",
  "typescript",
  "postgresql",
  "authentication",
  "accessibility",
  "responsive",
  "turborepo",
  "storybook",
  "playwright",
  "kubernetes",
  "pipelines",
  "graphql",
  "express",
  "mongodb",
  "firebase",
  "tailwind",
  "sentry",
  "splunk",
  "prisma",
  "supabase",
  "cypress",
  "webpack",
  "nextjs",
  "nodejs",
  "python",
  "react",
  "redux",
  "jest",
  "vite",
  "html5",
  "css3",
  "html",
  "css",
  "pnpm",
  "figma",
  "aria",
  "wcag",
  "rest",
  "aws",
  "docker",
  "vue",
  "angular",
  "svelte",
  "java",
  "golang",
  "ruby",
  "node",
].sort((a, b) => b.length - a.length);

const DICTIONARY_SET = new Set(SKILL_DICTIONARY);

export function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH, "");
}

export function repairEmailSpacing(text: string): string {
  return text.replace(
    /([A-Za-z0-9._+-]+)\s*@\s*([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    "$1@$2"
  );
}

function segmentToken(token: string): string[] | null {
  const lower = token.toLowerCase();
  if (DICTIONARY_SET.has(lower)) return null;

  const memo = new Map<number, string[] | null>();

  function walk(index: number): string[] | null {
    if (index === token.length) return [];
    if (memo.has(index)) return memo.get(index) ?? null;

    for (const word of SKILL_DICTIONARY) {
      if (!lower.startsWith(word, index)) continue;
      const rest = walk(index + word.length);
      if (!rest) continue;
      const parts = [token.slice(index, index + word.length), ...rest];
      memo.set(index, parts);
      return parts;
    }

    memo.set(index, null);
    return null;
  }

  const parts = walk(0);
  if (!parts || parts.length < 2) return null;
  return parts;
}

function splitCamelBoundaries(token: string): string[] | null {
  const parts = token
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean);

  if (parts.length < 2) return null;
  const safe = parts.every(
    (part) =>
      DICTIONARY_SET.has(part.toLowerCase()) ||
      /^[a-z]{4,}$/i.test(part)
  );
  return safe ? parts : null;
}

export function splitGluedToken(token: string): string[] {
  if (/[.@/]/.test(token)) return [token];
  if (DICTIONARY_SET.has(token.toLowerCase())) return [token];
  const segmented = segmentToken(token);
  if (segmented) return segmented;
  const camel = splitCamelBoundaries(token);
  if (camel) return camel;
  return [token];
}

export function splitGluedWords(text: string): string {
  return text.replace(/[A-Za-z][A-Za-z0-9+#.]*/g, (token) => splitGluedToken(token).join(" "));
}

export function isKnownSkillToken(text: string): boolean {
  return DICTIONARY_SET.has(text.trim().toLowerCase());
}

export const SKILL_CATEGORY_HEADING =
  /^(frontend|backend|back end|cloud(?:\s*&\s*backend)?|engineering practices|design systems|ui\s*\/\s*ux(?:\s*&\s*design)?|ui\/ux & design|testing|tools|languages|frameworks|platforms|databases|devops|soft skills|core skills)$/i;

export function isSkillCategoryHeading(text: string): boolean {
  const trimmed = text.trim().replace(/:$/, "");
  if (!trimmed || trimmed.length > 40) return false;
  if (SKILL_CATEGORY_HEADING.test(trimmed)) return true;
  if (
    !trimmed.includes(",") &&
    /&|\b(practices|systems|design|skills)\b/i.test(trimmed) &&
    !isKnownSkillToken(trimmed)
  ) {
    return true;
  }
  return false;
}
