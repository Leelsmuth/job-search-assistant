import { getResumeParseReview } from "@/server/actions";
import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";

export async function waitForResumeParse(
  parsedVersionId: string,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<{
  parsed: ParsedResume;
  normalizedText: string;
  sourcePreviewUrl: string | null;
  fileName: string | null;
}> {
  const maxAttempts = options?.maxAttempts ?? 60;
  const intervalMs = options?.intervalMs ?? 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const review = await getResumeParseReview(parsedVersionId);

    if (review.status === "failed") {
      throw new Error("Resume parsing failed. Try uploading again.");
    }

    if (review.status !== "processing") {
      return {
        parsed: review.parsed,
        normalizedText: review.normalizedText,
        sourcePreviewUrl: review.sourcePreviewUrl,
        fileName: review.fileName,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Resume parsing is taking longer than expected. Check back shortly.");
}
