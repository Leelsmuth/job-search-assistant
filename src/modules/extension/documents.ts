import { createClient } from "@supabase/supabase-js";
import { and, desc, eq } from "drizzle-orm";
import { coverLetters, resumeDocuments, resumeVersions } from "@/db/schema";
import { resolveSupabaseUrl } from "@/lib/env";
import { parseTailoredResumeDraft } from "@/modules/documents/bind-draft";
import { renderBlocksPdf } from "@/modules/documents/pdf";
import { letterBlocks, resumeBlocks } from "@/modules/documents/render-resume";
import { resolveTailoredResume } from "@/modules/documents/resolve-resume";
import type { ResolvedResume, TextBlock } from "@/modules/documents/types";
import type { Db } from "@/server/actions/helpers";

function pdfName(name: string, fallback: string): string {
  const base = name.replace(/\.(docx|txt|pdf)$/i, "").replace(/[^\w.\- ]+/g, "").trim();
  return `${base || fallback}.pdf`;
}

function readResolved(value: unknown): ResolvedResume | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { resolved?: unknown; draft?: unknown };
  const resolved = record.resolved;
  if (resolved && typeof resolved === "object") {
    const candidate = resolved as ResolvedResume;
    if (candidate.header && Array.isArray(candidate.experiences)) return candidate;
  }
  if (!record.draft) return null;
  try {
    return resolveTailoredResume(parseTailoredResumeDraft(record.draft));
  } catch {
    return null;
  }
}

async function pdfFromText(title: string, body: string): Promise<Uint8Array> {
  const blocks: TextBlock[] = [{ kind: "name", text: title }];
  for (const line of body.split(/\n+/)) {
    const text = line.trim();
    if (text) blocks.push({ kind: "body", text: text.slice(0, 2000) });
  }
  if (blocks.length === 1) blocks.push({ kind: "body", text: title });
  return renderBlocksPdf(blocks, title);
}

async function downloadOwnedResume(userId: string, storagePath: string): Promise<Uint8Array | null> {
  if (!storagePath.startsWith(`${userId}/`)) return null;
  const url = resolveSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || /your-key|placeholder|changeme/i.test(key)) return null;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.storage.from("resumes").download(storagePath);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const header = new TextDecoder().decode(bytes.subarray(0, 4));
  if (header !== "%PDF") return null;
  return bytes;
}

async function renderDefaultResume(
  db: Db,
  userId: string
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const document = await db.query.resumeDocuments.findFirst({
    where: eq(resumeDocuments.userId, userId),
    orderBy: [desc(resumeDocuments.createdAt)],
  });
  if (document?.storagePath) {
    const looksPdf =
      document.mimeType === "application/pdf" ||
      document.fileType === "pdf" ||
      /\.pdf$/i.test(document.fileName);
    if (looksPdf) {
      const bytes = await downloadOwnedResume(userId, document.storagePath);
      if (bytes) return { bytes, filename: pdfName(document.fileName, "resume") };
    }
  }
  const master = await db.query.resumeVersions.findFirst({
    where: and(eq(resumeVersions.userId, userId), eq(resumeVersions.versionType, "master")),
    orderBy: [desc(resumeVersions.updatedAt)],
  });
  const resolved = master ? readResolved(master.contentJson) : null;
  if (resolved) {
    const bytes = await renderBlocksPdf(resumeBlocks(resolved), resolved.header.name || "Resume");
    return { bytes, filename: pdfName(master?.name || "resume", "resume") };
  }
  const text = master?.contentText?.trim() || document?.extractedText?.trim() || "";
  if (!text) return null;
  const bytes = await pdfFromText(master?.name || "Resume", text);
  return { bytes, filename: pdfName(master?.name || document?.fileName || "resume", "resume") };
}

export async function renderExtensionDocument(
  db: Db,
  userId: string,
  kind: "resume" | "coverLetter",
  jobId: string | null
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  if (kind === "coverLetter") {
    if (!jobId) return null;
    const letter = await db.query.coverLetters.findFirst({
      where: and(eq(coverLetters.userId, userId), eq(coverLetters.jobId, jobId)),
      orderBy: [desc(coverLetters.updatedAt)],
      columns: { body: true },
    });
    if (!letter?.body.trim()) return null;
    const bytes = await renderBlocksPdf(letterBlocks(letter.body), "Cover letter");
    return { bytes, filename: "cover-letter.pdf" };
  }

  if (jobId) {
    const tailored = await db.query.resumeVersions.findFirst({
      where: and(eq(resumeVersions.userId, userId), eq(resumeVersions.jobId, jobId)),
      orderBy: [desc(resumeVersions.updatedAt)],
    });
    const resolved = tailored ? readResolved(tailored.contentJson) : null;
    if (resolved) {
      const bytes = await renderBlocksPdf(resumeBlocks(resolved), resolved.header.name || "Resume");
      return { bytes, filename: pdfName(tailored?.name || "resume", "resume") };
    }
    if (tailored?.contentText?.trim()) {
      const bytes = await pdfFromText(tailored.name || "Resume", tailored.contentText);
      return { bytes, filename: pdfName(tailored.name || "resume", "resume") };
    }
  }

  return renderDefaultResume(db, userId);
}
