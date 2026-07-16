import { eq, and, desc } from "drizzle-orm";
import type { Db } from "@/server/actions/helpers";
import {
  resumeDocuments,
  resumeVersions,
  resumeExtractions,
  parsedResumeVersions,
  aiRuns,
} from "@/db/schema";
import { validateResumeFile } from "@/modules/resumes/ingestion/resume-file-validator";
import { extractDocument } from "@/modules/resumes/extract/extract-document";
import { normalizeExtractedDocument, computeParserVersion } from "@/modules/resumes/normalize/extracted-document-normalizer";
import { parseResumeStructure } from "@/modules/resumes/parse/resume-structure-parser";
import { uploadResumeFile } from "@/modules/resumes/storage";
import { RESUME_PARSE_PROMPT_VERSION } from "@/modules/resumes/schema/resume-parser-prompts";
import { hashInput } from "@/lib/utils";
import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";

export type IngestResumeResult = {
  documentId: string;
  extractionId: string;
  parsedVersionId: string;
  parsed: ParsedResume;
  normalizedText: string;
  fromCache: boolean;
};

export async function ingestResumeFile(
  db: Db,
  userId: string,
  file: File
): Promise<IngestResumeResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const validated = validateResumeFile(buffer, file.name, file.type);

  const extractedDoc = await extractDocument(buffer, validated.detectedType);
  const normalized = normalizeExtractedDocument(extractedDoc);
  const parserVersion = computeParserVersion(RESUME_PARSE_PROMPT_VERSION);

  const cached = await db.query.parsedResumeVersions.findFirst({
    where: and(
      eq(parsedResumeVersions.userId, userId),
      eq(parsedResumeVersions.extractionHash, normalized.extractionHash),
      eq(parsedResumeVersions.parserVersion, parserVersion)
    ),
    orderBy: [desc(parsedResumeVersions.createdAt)],
  });

  const storagePath = await uploadResumeFile(
    userId,
    validated.fileName,
    buffer,
    validated.mimeType
  );

  const [doc] = await db
    .insert(resumeDocuments)
    .values({
      userId,
      storagePath,
      fileName: validated.fileName,
      fileType: extractedDoc.sourceType === "text" ? "txt" : extractedDoc.sourceType,
      fileSize: file.size,
      extractedText: normalized.normalizedText,
      parserVersion: extractedDoc.extractorVersion,
      mimeType: validated.mimeType,
      validationWarningsJson: [...validated.warnings, ...extractedDoc.warnings],
    })
    .returning();

  await db.insert(resumeVersions).values({
    userId,
    resumeDocumentId: doc.id,
    name: "Master Resume",
    versionType: "master",
    contentText: normalized.normalizedText,
  });

  const [extraction] = await db
    .insert(resumeExtractions)
    .values({
      userId,
      resumeDocumentId: doc.id,
      sourceType: extractedDoc.sourceType,
      extractorVersion: extractedDoc.extractorVersion,
      pageCount: extractedDoc.pageCount,
      itemCount: extractedDoc.itemCount,
      extractedDocumentJson: extractedDoc,
      normalizedText: normalized.normalizedText,
      normalizationVersion: normalized.normalizationVersion,
      extractionHash: normalized.extractionHash,
    })
    .returning();

  await db
    .update(resumeDocuments)
    .set({ latestExtractionId: extraction.id })
    .where(eq(resumeDocuments.id, doc.id));

  if (cached && cached.status !== "failed") {
    const [parsedVersion] = await db
      .insert(parsedResumeVersions)
      .values({
        userId,
        resumeExtractionId: extraction.id,
        schemaVersion: 1,
        parserVersion,
        promptVersion: RESUME_PARSE_PROMPT_VERSION,
        model: cached.model,
        parsedJson: cached.parsedJson,
        confidenceJson: cached.confidenceJson,
        warningsJson: cached.warningsJson,
        status: "pending_review",
        extractionHash: normalized.extractionHash,
        parseDurationMs: 0,
      })
      .returning();

    return {
      documentId: doc.id,
      extractionId: extraction.id,
      parsedVersionId: parsedVersion.id,
      parsed: cached.parsedJson as ParsedResume,
      normalizedText: normalized.normalizedText,
      fromCache: true,
    };
  }

  const start = Date.now();
  const parseResult = await parseResumeStructure(normalized);
  const durationMs = Date.now() - start;

  const [parsedVersion] = await db
    .insert(parsedResumeVersions)
    .values({
      userId,
      resumeExtractionId: extraction.id,
      schemaVersion: 1,
      parserVersion,
      promptVersion: parseResult.promptVersion,
      model: parseResult.model,
      parsedJson: parseResult.parsed,
      confidenceJson: parseResult.parsed.confidence,
      warningsJson: parseResult.parsed.warnings,
      status: "pending_review",
      extractionHash: normalized.extractionHash,
      parseDurationMs: durationMs,
      tokenUsageJson: parseResult.tokenUsage ?? null,
    })
    .returning();

  await db.insert(aiRuns).values({
    userId,
    taskType: "resume.parse_structured",
    promptVersion: parseResult.promptVersion,
    model: parseResult.model,
    inputHash: hashInput(`resume-parse:${normalized.extractionHash}`),
    inputSummary: `Resume: ${validated.fileName}`,
    output: {
      parsedVersionId: parsedVersion.id,
      usedRepair: parseResult.usedRepair,
      usedHeuristicOnly: parseResult.usedHeuristicOnly,
    },
    status: "completed",
    tokenInputCount: parseResult.tokenUsage?.input,
    tokenOutputCount: parseResult.tokenUsage?.output,
  });

  return {
    documentId: doc.id,
    extractionId: extraction.id,
    parsedVersionId: parsedVersion.id,
    parsed: parseResult.parsed,
    normalizedText: normalized.normalizedText,
    fromCache: false,
  };
}

export async function getParsedResumeVersion(
  db: Db,
  userId: string,
  parsedVersionId: string
) {
  const row = await db.query.parsedResumeVersions.findFirst({
    where: and(
      eq(parsedResumeVersions.id, parsedVersionId),
      eq(parsedResumeVersions.userId, userId)
    ),
    with: {
      extraction: {
        with: {
          document: true,
        },
      },
    },
  });
  return row ?? null;
}
