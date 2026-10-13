const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "our", "you",
  "are", "was", "were", "have", "has", "been", "will", "into", "using", "use",
  "used", "role", "work", "team", "job", "position", "experience", "skills",
  "skill", "required", "preferred", "ability", "strong", "including", "across",
  "within", "other", "such", "their", "they", "them", "about", "more", "most",
  "some", "any", "can", "able", "build", "building", "working", "plus", "well",
  "over", "under", "years", "year", "etc", "not", "but", "who", "what", "when",
  "where", "how", "all", "per", "via", "also", "than", "then", "just", "its",
]);

const CANADIAN_SPELLING: Array<[RegExp, string]> = [
  [/\bcolors\b/gi, "colours"],
  [/\bcolor\b/gi, "colour"],
  [/\bfavorites\b/gi, "favourites"],
  [/\bfavorite\b/gi, "favourite"],
  [/\bfavors\b/gi, "favours"],
  [/\bfavor\b/gi, "favour"],
  [/\bcenters\b/gi, "centres"],
  [/\bcentered\b/gi, "centred"],
  [/\bcenter\b/gi, "centre"],
  [/\bhonors\b/gi, "honours"],
  [/\bhonor\b/gi, "honour"],
  [/\blabors\b/gi, "labours"],
  [/\blabor\b/gi, "labour"],
  [/\btraveled\b/gi, "travelled"],
  [/\btraveling\b/gi, "travelling"],
  [/\bdefense\b/gi, "defence"],
  [/\blicense\b/gi, "licence"],
  [/\bgray\b/gi, "grey"],
];

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function clipWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

export function toCanadianEnglish(text: string): string {
  return CANADIAN_SPELLING.reduce(
    (current, [pattern, replacement]) =>
      current.replace(pattern, (match) =>
        match[0] === match[0].toUpperCase()
          ? replacement[0].toUpperCase() + replacement.slice(1)
          : replacement
      ),
    text
  );
}

export function clipText(text: string, max = 220): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
