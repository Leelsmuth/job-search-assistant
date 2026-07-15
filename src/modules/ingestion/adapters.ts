import {
  normalizedJobSchema,
  type NormalizedJob,
  type RawJobSource,
  type JobSourceAdapter,
} from "./types";
import { extractRequirementsFromText } from "./extract-requirements";
import { htmlToPlainText, extractTitleFromHtml, decodeHtmlEntities, sanitizeJobTitle } from "./html-text";
import { greenhouseAdapter } from "./greenhouse";
import { leverAdapter } from "./lever";

export const manualDescriptionAdapter: JobSourceAdapter = {
  provider: "pasted_description",

  async detect(input: string) {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) return { confidence: 0, reason: "JSON input" };
    const isUrl = /^https?:\/\//i.test(trimmed);
    return {
      confidence: isUrl ? 0 : 0.95,
      reason: isUrl ? "Looks like URL, not description" : "Pasted description",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    return {
      provider: "pasted_description",
      rawText: input.trim(),
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const text = formatRawJobText(raw.rawText);
    const titleMatch = text.match(/(?:title|position|role)[:\s]+([^\n]+)/i);
    const companyMatch = text.match(/(?:company|organization)[:\s]+([^\n]+)/i);
    const locationMatch = text.match(/(?:location)[:\s]+([^\n]+)/i);

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] ?? "";
    const title = sanitizeJobTitle(
      titleMatch?.[1]?.trim() || (firstLine.length <= 120 ? firstLine : undefined)
    );
    const company = sanitizeJobTitle(companyMatch?.[1]?.trim(), "Unknown Company");

    const isRemote = /remote/i.test(text);
    const workplaceType = isRemote ? ("remote" as const) : ("unknown" as const);

    const requirements = extractRequirementsFromText(text);

    return normalizedJobSchema.parse({
      company,
      title,
      location: locationMatch?.[1]?.trim(),
      workplaceType,
      description: text,
      responsibilities: requirements.responsibilities,
      requiredQualifications: requirements.required,
      preferredQualifications: requirements.preferred,
      technologies: requirements.technologies,
      jobUrl: raw.sourceUrl || "",
    });
  },
};

function formatRawJobText(raw: string): string {
  const trimmed = raw.trim();
  if (/<[^>]+>/.test(trimmed) || /&(?:#\d+|#x[\da-f]+|\w+);/i.test(trimmed)) {
    return htmlToPlainText(trimmed);
  }
  return decodeHtmlEntities(trimmed);
}

export const manualFormAdapter: JobSourceAdapter = {
  provider: "manual",

  async detect(input: string) {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      try {
        JSON.parse(trimmed);
        return { confidence: 1, reason: "Manual form JSON" };
      } catch {
        return { confidence: 0, reason: "Invalid JSON" };
      }
    }
    return { confidence: 0, reason: "Not manual form JSON" };
  },

  async fetch(input: string): Promise<RawJobSource> {
    return { provider: "manual", rawText: input };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    return normalizedJobSchema.parse(JSON.parse(raw.rawText));
  },
};

export const genericUrlAdapter: JobSourceAdapter = {
  provider: "generic_web",

  async detect(input: string) {
    const isUrl = /^https?:\/\//i.test(input.trim());
    return {
      confidence: isUrl ? 0.5 : 0,
      reason: isUrl ? "Generic URL" : "Not a URL",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const url = input.trim();
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "JobSearchAssistant/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const text = htmlToPlainText(html);
      const pageTitle = extractTitleFromHtml(html);
      return {
        provider: "generic_web",
        sourceUrl: url,
        rawText: text.slice(0, 50000),
        rawPayload: { url, status: response.status, pageTitle },
      };
    } catch (error) {
      return {
        provider: "generic_web",
        sourceUrl: url,
        rawText: `Failed to fetch URL: ${url}. Please paste the job description directly.`,
        rawPayload: { url, error: String(error) },
      };
    }
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const payload = raw.rawPayload as { pageTitle?: string } | undefined;
    const base = await manualDescriptionAdapter.normalize(raw);
    if (payload?.pageTitle) {
      return normalizedJobSchema.parse({
        ...base,
        title: sanitizeJobTitle(payload.pageTitle, base.title),
      });
    }
    return base;
  },
};

export const allAdapters: JobSourceAdapter[] = [
  manualFormAdapter,
  greenhouseAdapter,
  leverAdapter,
  manualDescriptionAdapter,
  genericUrlAdapter,
];

export async function detectBestAdapter(input: string): Promise<JobSourceAdapter> {
  const results = await Promise.all(
    allAdapters.map(async (a) => ({
      adapter: a,
      ...(await a.detect(input)),
    }))
  );
  results.sort((a, b) => b.confidence - a.confidence);
  return results[0]?.adapter ?? manualDescriptionAdapter;
}

/** @deprecated use detectBestAdapter */
export const detectAdapter = detectBestAdapter;

export async function importJob(input: string): Promise<{
  raw: RawJobSource;
  normalized: NormalizedJob;
  adapter: JobSourceAdapter;
}> {
  const adapter = await detectBestAdapter(input);
  const raw = await adapter.fetch(input);
  const normalized = await adapter.normalize(raw);
  return { raw, normalized, adapter };
}

export async function previewJobImport(input: string) {
  return importJob(input);
}
