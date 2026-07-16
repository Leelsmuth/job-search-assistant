"use client";

import { useEffect, useState } from "react";
import { getJobDetailTabData } from "@/server/actions";
import { ApplicationQAPanel } from "./application-qa-panel";

export function LazyApplicationQAPanel({
  jobId,
  applicationId,
}: {
  jobId: string;
  applicationId?: string;
}) {
  const [answers, setAnswers] = useState<
    Awaited<ReturnType<typeof getJobDetailTabData>>["answers"] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJobDetailTabData(jobId, "application")
      .then((data) => {
        if (!cancelled) setAnswers(data.answers ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load answers");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!answers) {
    return <p className="text-sm text-muted-foreground">Loading application Q&A…</p>;
  }

  return (
    <ApplicationQAPanel
      jobId={jobId}
      applicationId={applicationId}
      initialAnswers={answers}
    />
  );
}
