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
import {
  normalizeExtractedDocument,
  computeParserVersion,
  type NormalizedDocument,
} from "@/modules/resumes/normalize/extracted-document-normalizer";
import { parseResumeStructure } from "@/modules/resumes/parse/resume-structure-parser";
import { uploadResumeFile } from "@/modules/resumes/storage";
import { RESUME_PARSE_PROMPT_VERSION } from "@/modules/resumes/schema/resume-parser-prompts";
import { emptyParsedResume, type ParsedResume } from "@/modules/resumes/schema/resume-schema";
import { hashInput } from "@/lib/utils";
import { measureOperation } from "@/lib/performance/measure-operation";
import type { ExtractedDocument } from "@/modules/resumes/extract/types";

export type IngestResumeResult = {
  documentId: string;
  extractionId: string;
  parsedVersionId: string;
  parsed: ParsedResume;
  normalizedText: string;
  fromCache: boolean;
  processing?: boolean;
};

export async function completeResumeParse(
  db: Db,
  userId: string,
  parsedVersionId: string
): Promise<void> {
  await measureOperation(
    "resume.completeParse",
    async () => {
      const version = await db.query.parsedResumeVersions.findFirst({
        where: and(
          eq(parsedResumeVersions.id, parsedVersionId),
          eq(parsedResumeVersions.userId, userId)
        ),
        with: { extraction: true },
      });

      if (!version?.extraction) {
        throw new Error("Resume parse job not found.");
      }

      const extractedDoc = version.extraction
        .extractedDocumentJson as ExtractedDocument;
      const normalized = normalizeExtractedDocument(extractedDoc);

      try {
        const start = Date.now();
        const parseResult = await parseResumeStructure(normalized);
        const durationMs = Date.now() - start;

        await db
          .update(parsedResumeVersions)
          .set({
            parsedJson: parseResult.parsed,
            confidenceJson: parseResult.parsed.confidence,
            warningsJson: parseResult.parsed.warnings,
            promptVersion: parseResult.promptVersion,
            model: parseResult.model,
            status: "pending_review",
            parseDurationMs: durationMs,
            tokenUsageJson: parseResult.tokenUsage ?? null,
          })
          .where(eq(parsedResumeVersions.id, parsedVersionId));

        await db.insert(aiRuns).values({
          userId,
          taskType: "resume.parse_structured",
          promptVersion: parseResult.promptVersion,
          model: parseResult.model,
          inputHash: hashInput(`resume-parse:${normalized.extractionHash}`),
          inputSummary: `Resume extraction ${version.resumeExtractionId}`,
          output: {
            parsedVersionId,
            usedRepair: parseResult.usedRepair,
            usedHeuristicOnly: parseResult.usedHeuristicOnly,
            durationMs,
          },
          status: "completed",
          tokenInputCount: parseResult.tokenUsage?.input,
          tokenOutputCount: parseResult.tokenUsage?.output,
        });
      } catch (error) {
        await db
          .update(parsedResumeVersions)
          .set({ status: "failed" })
          .where(eq(parsedResumeVersions.id, parsedVersionId));
        throw error;
      }
    },
    { source: "resume" }
  );
}

export async function ingestResumeFile(
  db: Db,
  userId: string,
  file: File,
  options?: { deferParse?: boolean }
): Promise<IngestResumeResult> {
  return measureOperation(
    "resume.ingestFile",
    async () => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const validated = validateResumeFile(buffer, file.name, file.type);

      const extractedDoc = await measureOperation(
        "resume.extract",
        () => extractDocument(buffer, validated.detectedType),
        { source: "resume" }
      );
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
          fileType:
            extractedDoc.sourceType === "text" ? "txt" : extractedDoc.sourceType,
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

      const placeholder = emptyParsedResume();
      const [parsedVersion] = await db
        .insert(parsedResumeVersions)
        .values({
          userId,
          resumeExtractionId: extraction.id,
          schemaVersion: 1,
          parserVersion,
          promptVersion: RESUME_PARSE_PROMPT_VERSION,
          model: null,
          parsedJson: placeholder,
          confidenceJson: placeholder.confidence,
          warningsJson: placeholder.warnings,
          status: "processing",
          extractionHash: normalized.extractionHash,
        })
        .returning();

      return {
        documentId: doc.id,
        extractionId: extraction.id,
        parsedVersionId: parsedVersion.id,
        parsed: placeholder,
        normalizedText: normalized.normalizedText,
        fromCache: false,
        processing: true,
      };
    },
    { source: "resume" }
  );
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
