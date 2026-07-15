"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadResume,
  deleteResumeDocument,
  listResumeDocuments,
} from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ResumeUploadField } from "@/components/resumes/resume-upload-field";
import { Loader2 } from "lucide-react";

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
  const [isPending, startTransition] = useTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [wipeExtracted, setWipeExtracted] = useState(false);

  function refreshDocuments() {
    startTransition(async () => {
      const updated = await listResumeDocuments();
      setDocuments(updated);
    });
  }

  async function handleUpload(formData: FormData) {
    try {
      await uploadResume(formData);
      toast({ title: "Resume uploaded", description: "File saved successfully." });
      refreshDocuments();
      router.refresh();
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      throw err;
    }
  }

  function handleDelete(documentId: string) {
    startTransition(async () => {
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
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Resumes</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Resume</CardTitle>
        </CardHeader>
        <CardContent>
          <ResumeUploadField
            onUpload={handleUpload}
            hint="Use onboarding to review extracted profile data after upload."
          />
        </CardContent>
      </Card>

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
                        disabled={isPending}
                        onClick={() => handleDelete(doc.id)}
                      >
                        {isPending ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          "Confirm delete"
                        )}
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
