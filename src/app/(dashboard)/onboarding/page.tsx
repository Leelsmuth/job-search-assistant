"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadResume, applyResumeSuggestions } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ResumeUploadField } from "@/components/resumes/resume-upload-field";
import type { ProfileExtraction } from "@/modules/ai/client";

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [extractedText, setExtractedText] = useState("");
  const [suggestions, setSuggestions] = useState<ProfileExtraction | null>(null);
  const [error, setError] = useState("");

  async function handleUpload(formData: FormData) {
    setError("");
    try {
      const result = await uploadResume(formData);
      setExtractedText(result.extractedText);
      setSuggestions(result.suggestions);
      setStep("review");
      toast({ title: "Resume uploaded", description: "Review extracted data below." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
      throw err;
    }
  }

  function handleApprove() {
    if (!suggestions) return;
    startTransition(async () => {
      try {
        await applyResumeSuggestions(suggestions, extractedText);
        toast({ title: "Profile saved" });
        router.push("/profile");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        toast({ title: "Save failed", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Welcome — Set Up Your Profile</h1>
      <p className="text-muted-foreground">
        Upload your resume. Review extracted data before it affects matching.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Resume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResumeUploadField onUpload={handleUpload} />
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => router.push("/profile")}
            >
              Skip for now
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "review" && suggestions && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extracted Profile Suggestions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {suggestions.summary && <p>{suggestions.summary}</p>}
              <p>
                <strong>Skills:</strong>{" "}
                {suggestions.skills?.map((s) => s.name).join(", ")}
              </p>
              {suggestions.experiences?.map((exp, i) => (
                <div key={i}>
                  <strong>
                    {exp.title} at {exp.company}
                  </strong>
                  <ul className="ml-4 list-disc">
                    {exp.bullets?.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button onClick={handleApprove} disabled={isPending}>
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
