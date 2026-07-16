"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  uploadResume,
  deleteResumeDocument,
  listResumeDocuments,
  approveParsedResume,
  getResumeParseReview,
} from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ResumeUploadField } from "@/components/resumes/resume-upload-field";
import { ParsedResumeReview } from "@/components/resumes/review/parsed-resume-review";
import { usePendingTransition } from "@/components/layout/action-pending-provider";
import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";
import { sanitizeParsedResume } from "@/modules/resumes/schema/resume-schema";

type ResumeDoc = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number | null;
  createdAt: Date;
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumesClient({ initialDocuments }: { initialDocuments: ResumeDoc[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [documents, setDocuments] = useState(initialDocuments);
  const { isPending, run } = usePendingTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [wipeExtracted, setWipeExtracted] = useState(false);
  const [reviewStep, setReviewStep] = useState<"idle" | "review">("idle");
  const [parsedVersionId, setParsedVersionId] = useState<string | null>(null);
  const [normalizedText, setNormalizedText] = useState("");
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);

  function refreshDocuments() {
    run(async () => {
      const updated = await listResumeDocuments();
      setDocuments(updated);
    });
  }

  async function handleUpload(formData: FormData) {
    try {
      const result = await uploadResume(formData);
      setParsedVersionId(result.parsedVersionId);
      setNormalizedText(result.extractedText);
      setParsed(result.parsed);
      setReviewStep("review");
      refreshDocuments();

      const review = await getResumeParseReview(result.parsedVersionId);
      setSourcePreviewUrl(review.sourcePreviewUrl);
      setFileName(review.fileName);

      toast({
        title: "Resume uploaded",
        description: "Review the structured profile below before saving.",
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      throw err;
    }
  }

  function handleApproveProfile() {
    if (!parsed || !parsedVersionId) return;

    if (parsed.confidence.overall < 0.5) {
      const ok = window.confirm(
        "Parser confidence is low. Save to profile anyway?"
      );
      if (!ok) return;
    }

    const cleaned = sanitizeParsedResume(parsed);
    run(async () => {
      try {
        await approveParsedResume(parsedVersionId, cleaned);
        setReviewStep("idle");
        setParsed(null);
        setParsedVersionId(null);
        toast({ title: "Profile updated", description: "Structured resume data saved." });
        router.refresh();
      } catch (err) {
        toast({
          title: "Save failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  function handleDelete(documentId: string) {
    run(async () => {
      try {
        await deleteResumeDocument(documentId, { wipeExtractedData: wipeExtracted });
        setDocuments((prev) => prev.filter((d) => d.id !== documentId));
        setPendingDeleteId(null);
        setWipeExtracted(false);
        toast({
          title: "Resume deleted",
          description: wipeExtracted
            ? "File and extracted profile data removed."
            : "File removed from storage.",
        });
        router.refresh();
      } catch (err) {
        toast({
          title: "Delete failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Resumes</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Resume</CardTitle>
        </CardHeader>
        <CardContent>
          <ResumeUploadField
            onUpload={handleUpload}
            hint="After upload, review structured sections before saving to your profile."
          />
        </CardContent>
      </Card>

      {reviewStep === "review" && parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review structured profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confidence: {Math.round(parsed.confidence.overall * 100)}%
            </p>
            <ParsedResumeReview
              value={parsed}
              onChange={setParsed}
              normalizedText={normalizedText}
              sourcePreviewUrl={sourcePreviewUrl}
              fileName={fileName}
            />
            <div className="flex gap-2">
              <Button loading={isPending} disabled={isPending} onClick={handleApproveProfile}>
                {isPending ? "Saving..." : "Save to profile"}
              </Button>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setReviewStep("idle");
                  setParsed(null);
                }}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Resume Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resumes uploaded yet.</p>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="font-medium">{doc.fileName}</p>
                  <p className="text-muted-foreground">
                    {doc.fileType.toUpperCase()} · {formatFileSize(doc.fileSize)} ·{" "}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {pendingDeleteId === doc.id ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      This removes the file from storage. Optionally wipe skills, experience,
                      and evidence imported from resumes.
                    </p>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={wipeExtracted}
                        onChange={(e) => setWipeExtracted(e.target.checked)}
                      />
                      Also delete extracted profile data
                    </label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={isPending}
                        onClick={() => handleDelete(doc.id)}
                      >
                        {isPending ? "Deleting..." : "Confirm delete"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => {
                          setPendingDeleteId(null);
                          setWipeExtracted(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setPendingDeleteId(doc.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
