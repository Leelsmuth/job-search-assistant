import {
  normalizedJobSchema,
  type NormalizedJob,
  type RawJobSource,
  type JobSourceAdapter,
} from "./types";
import { extractRequirementsFromText } from "./extract-requirements";
import { htmlToPlainText, sanitizeJobTitle } from "./html-text";
import { extractLeverCompanySlug, normalizeBoardUrl } from "./board-url";
import { fetchWithTimeout } from "@/lib/performance/fetch-with-timeout";

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  categories: {
    location?: string;
    team?: string;
    commitment?: string;
  };
  createdAt: number;
};

export const leverAdapter: JobSourceAdapter = {
  provider: "lever",

  async detect(input: string) {
    const isLever = /jobs\.lever\.co/i.test(input) || /api\.lever\.co/i.test(input);
    return {
      confidence: isLever ? 0.95 : 0,
      reason: isLever ? "Lever URL detected" : "Not Lever",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const url = input.trim();

    const postingMatch = url.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/i);
    if (postingMatch) {
      const [, company, postingId] = postingMatch;
      const apiUrl = `https://api.lever.co/v0/postings/${company}/${postingId}`;
      const response = await fetchWithTimeout(apiUrl);
      if (response.ok) {
        const posting = (await response.json()) as LeverPosting;
        return {
          provider: "lever",
          sourceUrl: url,
          sourceJobId: posting.id,
          rawText: posting.text,
          rawPayload: posting,
        };
      }
    }

    let company: string | null = null;
    try {
      company = normalizeBoardUrl(url, "lever").boardSlug;
    } catch {
      company = extractLeverCompanySlug(url);
    }
    if (company && !url.match(/jobs\.lever\.co\/[^/]+\/[a-f0-9-]+/i)) {
      const apiUrl = `https://api.lever.co/v0/postings/${company}`;
      const response = await fetchWithTimeout(apiUrl);
      if (response.ok) {
        const postings = (await response.json()) as LeverPosting[];
        const combined = postings.map((p) => p.text).join("\n\n");
        return {
          provider: "lever",
          sourceUrl: url,
          rawText: combined,
          rawPayload: postings,
        };
      }
    }

    throw new Error("Could not fetch Lever posting. Check URL or paste description.");
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const payload = raw.rawPayload as LeverPosting | LeverPosting[] | undefined;

    if (payload && !Array.isArray(payload) && "text" in payload) {
      const posting = payload;
      const plainText = htmlToPlainText(posting.text);
      const reqs = extractRequirementsFromText(plainText);
      const titleLine = plainText.split("\n").map((l) => l.trim()).find(Boolean);

      return normalizedJobSchema.parse({
        company: sanitizeJobTitle(posting.categories.team, "Company"),
        title: sanitizeJobTitle(titleLine),
        location: posting.categories.location,
        workplaceType: /remote/i.test(posting.categories.location ?? "") ? "remote" : "unknown",
        description: plainText,
        responsibilities: reqs.responsibilities,
        requiredQualifications: reqs.required,
        preferredQualifications: reqs.preferred,
        technologies: reqs.technologies,
        jobUrl: posting.hostedUrl ?? raw.sourceUrl,
        sourceJobId: posting.id,
        employmentType: posting.categories.commitment,
        datePosted: new Date(posting.createdAt).toISOString(),
      });
    }

    const reqs = extractRequirementsFromText(htmlToPlainText(raw.rawText));
    return normalizedJobSchema.parse({
      company: "Lever Board",
      title: "Multiple Positions",
      description: htmlToPlainText(raw.rawText),
      responsibilities: reqs.responsibilities,
      requiredQualifications: reqs.required,
      preferredQualifications: reqs.preferred,
      technologies: reqs.technologies,
      jobUrl: raw.sourceUrl,
    });
  },
};
