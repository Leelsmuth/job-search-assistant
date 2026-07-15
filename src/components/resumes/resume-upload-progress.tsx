"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export const RESUME_UPLOAD_STAGES = [
  { label: "Uploading file", detail: "Sending your resume to secure storage" },
  { label: "Extracting text", detail: "Reading PDF, DOCX, or plain text" },
  { label: "Analyzing profile", detail: "Identifying skills, experience, and summary" },
  { label: "Finishing up", detail: "Saving results" },
] as const;

export function useResumeUploadStages(isActive: boolean) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setStageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStageIndex((current) =>
        Math.min(current + 1, RESUME_UPLOAD_STAGES.length - 1)
      );
    }, 2200);

    return () => clearInterval(interval);
  }, [isActive]);

  const progress = isActive
    ? Math.min(95, ((stageIndex + 1) / RESUME_UPLOAD_STAGES.length) * 100)
    : 0;

  return {
    stage: RESUME_UPLOAD_STAGES[stageIndex],
    stageIndex,
    progress,
  };
}

type ResumeUploadProgressProps = {
  fileName: string;
  stage: (typeof RESUME_UPLOAD_STAGES)[number];
  progress: number;
};

export function ResumeUploadProgress({
  fileName,
  stage,
  progress,
}: ResumeUploadProgressProps) {
  return (
    <div
      className="rounded-lg border border-primary/20 bg-primary/5 p-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium text-sm">{stage.label}…</p>
            <p className="text-xs text-muted-foreground">{stage.detail}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{fileName}</p>
          </div>
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This usually takes a few seconds. Please keep this tab open.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
