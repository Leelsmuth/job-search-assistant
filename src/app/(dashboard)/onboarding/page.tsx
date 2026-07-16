"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadResume, approveParsedResume } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ResumeUploadField } from "@/components/resumes/resume-upload-field";
import { ParsedResumeReview } from "@/components/resumes/review/parsed-resume-review";
import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";
import { sanitizeParsedResume } from "@/modules/resumes/schema/resume-schema";

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [parsedVersionId, setParsedVersionId] = useState<string | null>(null);
  const [normalizedText, setNormalizedText] = useState("");
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [error, setError] = useState("");

  async function handleUpload(formData: FormData) {
    setError("");
    try {
      const result = await uploadResume(formData);
      setParsedVersionId(result.parsedVersionId);
      setNormalizedText(result.extractedText);
      setParsed(result.parsed);
      setStep("review");
      toast({
        title: "Resume uploaded",
        description: "Review the structured profile before saving.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
      throw err;
    }
  }

  function handleApprove() {
    if (!parsed || !parsedVersionId) return;

    const needsConfirm = parsed.confidence.overall < 0.5;
    if (needsConfirm) {
      const ok = window.confirm(
        "Parser confidence is low. Approve anyway and save to your profile?"
      );
      if (!ok) return;
    }

    const cleaned = sanitizeParsedResume(parsed);
    startTransition(async () => {
      try {
        await approveParsedResume(parsedVersionId, cleaned);
        toast({
          title: "Profile saved",
          description: "Your structured resume data is now on your profile.",
        });
        router.push("/profile");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        toast({ title: "Save failed", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Welcome — Set Up Your Profile</h1>
      <p className="text-muted-foreground">
        Upload your resume. Edit the structured extraction before it affects matching.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Resume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResumeUploadField onUpload={handleUpload} />
            <Button variant="ghost" className="mt-4" onClick={() => router.push("/profile")}>
              Skip for now
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "review" && parsed && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review structured profile</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Overall confidence: {Math.round(parsed.confidence.overall * 100)}% — edit
                sections below before approving.
              </p>
              <ParsedResumeReview
                value={parsed}
                onChange={setParsed}
                normalizedText={normalizedText}
              />
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button onClick={handleApprove} loading={isPending} disabled={isPending}>
              {isPending ? "Saving..." : "Approve & Continue"}
            </Button>
            <Button variant="outline" onClick={() => setStep("upload")}>
              Re-upload
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
