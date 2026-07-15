"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResumeUploadProgress,
  useResumeUploadStages,
} from "@/components/resumes/resume-upload-progress";

type ResumeUploadFieldProps = {
  onUpload: (formData: FormData) => Promise<void>;
  disabled?: boolean;
  hint?: string;
  accept?: string;
};

export function ResumeUploadField({
  onUpload,
  disabled = false,
  hint = "Supports PDF, DOCX, and TXT (max 5 MB)",
  accept = ".pdf,.docx,.txt",
}: ResumeUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const { stage, progress } = useResumeUploadStages(isPending && Boolean(uploadingFileName));

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFileName(file.name);
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      try {
        await onUpload(formData);
      } finally {
        setUploadingFileName(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  const isUploading = isPending && Boolean(uploadingFileName);

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      {isUploading && uploadingFileName ? (
        <ResumeUploadProgress
          fileName={uploadingFileName}
          stage={stage}
          progress={progress}
        />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isUploading}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="font-medium text-sm">Choose a resume file</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </button>
      )}

      {!isUploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
      )}
    </div>
  );
}
