const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (entity.startsWith("#")) {
        const code = parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");

  text = decodeHtmlEntities(text);
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");

  return text.trim();
}

export function extractTitleFromHtml(html: string): string | undefined {
  const ogTitle = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogTitle?.[1]) return decodeHtmlEntities(ogTitle[1].trim());

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag?.[1]) {
    const title = decodeHtmlEntities(titleTag[1].trim());
    const cleaned = title.split(/\s*[|\-–—]\s*/)[0]?.trim();
    if (cleaned && cleaned.length <= 120) return cleaned;
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) {
    const title = htmlToPlainText(h1[1]).trim();
    if (title.length <= 120) return title;
  }

  return undefined;
}

export function sanitizeJobTitle(title: string | undefined, fallback = "Untitled Role"): string {
  if (!title) return fallback;
  const cleaned = decodeHtmlEntities(title.replace(/\s+/g, " ").trim());
  if (!cleaned || cleaned.length > 120) return fallback;
  return cleaned;
}

export function resolveDisplayTitle(title: string, description: string): string {
  const fromTitle = sanitizeJobTitle(title, "");
  if (fromTitle) return fromTitle;

  const firstLine = formatJobDescription(description)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 8 && line.length <= 120);

  return sanitizeJobTitle(firstLine);
}

export function formatJobDescription(description: string): string {
  const hasHtml = /<[^>]+>/.test(description) || /&(?:#\d+|#x[\da-f]+|\w+);/i.test(description);
  const text = hasHtml ? htmlToPlainText(description) : decodeHtmlEntities(description);
  return text.trim();
}
