"use client";

import { useState, useTransition } from "react";
import {
  generateTailoring,
  updateTailoringDecision,
} from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

type Suggestion = {
  id: string;
  suggestionType: string;
  originalText: string | null;
  suggestedText: string;
  confidence: number | null;
  decision: string;
  evidenceId: string | null;
  evidence: {
    id: string;
    evidenceText: string;
    sourceType: string;
  } | null;
};

export function TailoringPanel({
  jobId,
  initialSuggestions,
}: {
  jobId: string;
  initialSuggestions: Suggestion[];
}) {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [isPending, startTransition] = useTransition();

  function handleDecision(id: string, decision: "accepted" | "rejected") {
    startTransition(async () => {
      try {
        await updateTailoringDecision(id, decision);
        setSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, decision } : s))
        );
        toast({ title: decision === "accepted" ? "Accepted" : "Rejected" });
      } catch (e) {
        toast({
          title: "Update failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <Button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            try {
              const result = await generateTailoring(jobId);
              setSuggestions(result);
              toast({ title: "Suggestions generated" });
            } catch (e) {
              toast({
                title: "Generation failed",
                description: e instanceof Error ? e.message : "Unknown error",
                variant: "destructive",
              });
            }
          })
        }
      >
        {isPending ? "Generating..." : "Generate Tailoring Suggestions"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Suggestions only — never auto-applied. Review each change for factual accuracy.
      </p>
      {suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground">No suggestions yet.</p>
      )}
      {suggestions.map((s) => {
        const lowConfidence = s.confidence != null && s.confidence < 0.5;
        const noEvidence = !s.evidenceId && !s.evidence;
        return (
          <Card key={s.id}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  {s.suggestionType}
                </span>
                {s.confidence != null && (
                  <Badge className="border border-border bg-transparent">
                    {Math.round(s.confidence * 100)}% confidence
                  </Badge>
                )}
                {lowConfidence && (
                  <Badge className="bg-amber-100 text-amber-900">Low confidence</Badge>
                )}
                {noEvidence && (
                  <Badge className="bg-amber-100 text-amber-900">No evidence cited</Badge>
                )}
                {s.decision !== "pending" && (
                  <Badge className="border border-border bg-transparent">{s.decision}</Badge>
                )}
              </div>
              {s.originalText && (
                <div>
                  <span className="font-medium">Original: </span>
                  {s.originalText}
                </div>
              )}
              <div>
                <span className="font-medium">Suggested: </span>
                {s.suggestedText}
              </div>
              {s.evidence?.evidenceText ? (
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Supporting evidence ({s.evidence.sourceType}):
                  </span>
                  <p className="mt-1">{s.evidence.evidenceText}</p>
                </div>
              ) : (
                <p className="text-xs text-amber-800">
                  Review carefully — no linked evidence for this suggestion.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending || s.decision === "accepted"}
                  onClick={() => handleDecision(s.id, "accepted")}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending || s.decision === "rejected"}
                  onClick={() => handleDecision(s.id, "rejected")}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
