"use client";

import { useEffect, useState } from "react";
import { getJobDetailTabData } from "@/server/actions";
import { TailoringPanel } from "./tailoring-panel";

export function LazyTailoringPanel({ jobId }: { jobId: string }) {
  const [suggestions, setSuggestions] = useState<
    Awaited<ReturnType<typeof getJobDetailTabData>>["suggestions"] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJobDetailTabData(jobId, "tailoring")
      .then((data) => {
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load tailoring");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!suggestions) {
    return <p className="text-sm text-muted-foreground">Loading tailoring suggestions…</p>;
  }

  return <TailoringPanel jobId={jobId} initialSuggestions={suggestions} />;
}
