"use server";

import { revalidatePath } from "next/cache";
import { withUserDb } from "@/db/user-context";
import { getUser } from "@/lib/supabase/server";
import {
  ingestResumeFile,
  getParsedResumeVersion,
} from "@/modules/resumes/ingestion/resume-ingestion-service";
import { approveParsedResumeVersion } from "@/modules/resumes/map/candidate-profile-mapper";
import { getResumeSignedUrl } from "@/modules/resumes/storage";
import {
  sanitizeParsedResume,
  type ParsedResume,
} from "@/modules/resumes/schema/resume-schema";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function uploadResume(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  return withUserDb(user.id, async (db) => {
    const result = await ingestResumeFile(db, user.id, file);
    revalidatePath("/resumes");
    revalidatePath("/onboarding");
    return {
      documentId: result.documentId,
      extractionId: result.extractionId,
      parsedVersionId: result.parsedVersionId,
      extractedText: result.normalizedText,
      parsed: result.parsed,
      fromCache: result.fromCache,
    };
  });
}

export async function getResumeParseReview(parsedVersionId: string) {
  const user = await requireUser();
  return withUserDb(user.id, async (db) => {
    const row = await getParsedResumeVersion(db, user.id, parsedVersionId);
    if (!row) throw new Error("Parse review not found");

    let sourcePreviewUrl: string | null = null;
    const storagePath = row.extraction?.document?.storagePath;
    if (storagePath) {
      sourcePreviewUrl = await getResumeSignedUrl(storagePath);
    }

    return {
      parsedVersionId: row.id,
      parsed: row.parsedJson as ParsedResume,
      normalizedText: row.extraction?.normalizedText ?? "",
      confidence: row.confidenceJson,
      warnings: row.warningsJson,
      status: row.status,
      sourcePreviewUrl,
      fileName: row.extraction?.document?.fileName ?? null,
    };
  });
}

export async function approveParsedResume(
  parsedVersionId: string,
  editedParsed: ParsedResume
) {
  const user = await requireUser();
  const cleaned = sanitizeParsedResume(editedParsed);

  return withUserDb(user.id, async (db) => {
    await approveParsedResumeVersion(db, user.id, parsedVersionId, cleaned);
    revalidatePath("/profile");
    revalidatePath("/resumes");
    revalidatePath("/onboarding");
    return { success: true };
  });
}

export async function uploadResumeText(text: string) {
  const user = await requireUser();
  const buffer = Buffer.from(text, "utf-8");
  const file = new File([buffer], "pasted-resume.txt", { type: "text/plain" });
  const formData = new FormData();
  formData.set("file", file);
  return uploadResume(formData);
}
