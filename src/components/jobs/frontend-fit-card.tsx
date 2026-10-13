"use client";

import { useState } from "react";
import { enhanceFrontendFitAction } from "@/server/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

type Fit = {
  score: number;
  reasons: string[];
};

type LocationInfo = {
  label: string;
  reason: string;
  flags: string[];
};

const FLAG_LABELS: Record<string, string> = {
  us_only: "US-only",
  us_work_authorization: "US work authorization",
  visa_sponsorship_ambiguous: "Visa sponsorship unclear",
  eligibility_ambiguous: "Canada eligibility unclear",
  region_restricted: "Region-restricted",
};

export function FrontendFitCard({
  jobId,
  fit,
  location,
  aiAvailable,
}: {
  jobId: string;
  fit: Fit;
  location: LocationInfo;
  aiAvailable: boolean;
}) {
  const { toast } = useToast();
  const [display, setDisplay] = useState(fit);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Frontend fit</span>
          <span className="text-2xl font-bold">{display.score}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge className="border border-border bg-transparent">{location.label}</Badge>
          {location.flags.map((flag) => (
            <Badge key={flag} className="bg-amber-100 text-amber-900">
              {FLAG_LABELS[flag] ?? flag}
            </Badge>
          ))}
        </div>
        <p className="text-muted-foreground">{location.reason}</p>
        <ul className="list-disc space-y-1 pl-5">
          {display.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        {aiAvailable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={pending}
            onClick={() => {
              setPending(true);
              enhanceFrontendFitAction(jobId)
                .then((enhanced) => {
                  setDisplay({ score: enhanced.score, reasons: enhanced.reasons });
                  setNote(
                    enhanced.enhanced
                      ? enhanced.note
                      : "AI enhancement was unavailable. Showing the deterministic score."
                  );
                })
                .catch((error: unknown) => {
                  toast({
                    title: "Could not enhance score",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive",
                  });
                })
                .finally(() => setPending(false));
            }}
          >
            {pending ? "Enhancing..." : "Enhance with AI"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Deterministic score. Add OPENAI_API_KEY to optionally rewrite these reasons with the configured OpenAI model.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
