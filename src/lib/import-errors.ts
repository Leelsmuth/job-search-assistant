export function mapImportError(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("enotfound") ||
    lower.includes("could not reach") ||
    lower.includes("failed to fetch")
  ) {
    return "Couldn't reach that URL. Try pasting the job description instead.";
  }

  if (lower.includes("payload too large") || lower.includes("import too large")) {
    return "Import too large. Shorten the description or remove extra content.";
  }

  if (
    lower.includes("zod") ||
    /\binvalid\b/.test(lower) ||
    lower.includes("too big") ||
    lower.includes("too long") ||
    /\bexpected string\b/.test(lower)
  ) {
    return "Some fields look invalid. Check title, company, and description length.";
  }

  if (lower.includes("unauthorized")) {
    return "You must be signed in to import jobs.";
  }

  return "Import failed. Check your input and try again.";
}
