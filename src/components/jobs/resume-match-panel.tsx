"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { usePendingTransition } from "@/components/layout/action-pending-provider";
import {
  applyResumeMatchSuggestions,
  generateResumeMatchSuggestions,
  getResumeMatch,
} from "@/server/actions/resume-score-actions";
import type { ResumeMatchView, ResumeScoreSource, ResumeSuggestion } from "@/modules/resume-score/types";

const SUBSCORES: Array<{ id: keyof ResumeMatchView["score"]["subscores"]; label: string }> = [
  { id: "hardSkills", label: "Hard skills" },
  { id: "keywords", label: "Keyword coverage" },
  { id: "seniority", label: "Title and seniority" },
  { id: "experienceYears", label: "Experience years" },
  { id: "atsFormat", label: "ATS format" },
];

export function ResumeMatchPanel({
  jobId,
  initial,
}: {
  jobId: string;
  initial: ResumeMatchView | null;
}) {
  const { toast } = useToast();
  const { isPending, run } = usePendingTransition();
  const [match, setMatch] = useState(initial);
  const [suggestions, setSuggestions] = useState<ResumeSuggestion[]>(initial?.suggestions ?? []);
  const [notice, setNotice] = useState<string | null>(
    initial?.suggestionsCached ? "Loaded saved suggestions for this resume and posting. No new model call." : null
  );
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  if (!match) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resume match</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Upload a resume to see how it matches this posting.{" "}
          <Link href="/resumes" className="text-primary underline">
            Resumes
          </Link>
        </CardContent>
      </Card>
    );
  }

  const selected = suggestions.filter((suggestion) => accepted[suggestion.bulletId]);

  function loadSource(source: ResumeScoreSource) {
    run(async () => {
      try {
        const next = await getResumeMatch(jobId, source);
        setMatch(next);
        setSuggestions(next?.suggestions ?? []);
        setAccepted({});
        setNotice(next?.suggestionsCached ? "Loaded saved suggestions for this resume and posting." : null);
      } catch (error) {
        toast({
          title: "Could not score this resume",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Resume match</CardTitle>
          <div className="text-right">
            <div className="text-2xl font-bold leading-none">{match.score.overall}</div>
            <p className="text-xs text-muted-foreground">ATS · {match.sourceLabel}</p>
          </div>
        </div>
        {match.hasParsed && match.hasTailored ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={match.source === "parsed" ? "default" : "outline"}
              disabled={isPending}
              onClick={() => loadSource("parsed")}
            >
              Parsed resume
            </Button>
            <Button
              type="button"
              size="sm"
              variant={match.source === "tailored" ? "default" : "outline"}
              disabled={isPending}
              onClick={() => loadSource("tailored")}
            >
              Tailored resume
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {match.beforeScore != null && match.afterScore != null ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2">
            Before <strong>{match.beforeScore}</strong>
            {" → "}
            after <strong>{match.afterScore}</strong>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {SUBSCORES.map((item) => (
            <div key={item.id}>
              <div className="flex justify-between gap-2">
                <span className="font-medium">{item.label}</span>
                <span>{match.score.subscores[item.id]}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${match.score.subscores[item.id]}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{match.score.reasons[item.id]}</p>
            </div>
          ))}
        </div>

        <div>
          <h3 className="font-medium">ATS checks</h3>
          <ul className="mt-2 space-y-1">
            {match.score.checks.map((check) => (
              <li key={check.id} className="flex flex-wrap items-baseline gap-2">
                <Badge className={check.passed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}>
                  {check.passed ? "Pass" : "Fix"}
                </Badge>
                <span className="font-medium">{check.label}</span>
                <span className="text-muted-foreground">{check.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <KeywordList
          title="Add this"
          empty="The resume already includes the keywords your profile can support."
          items={match.score.add.map((item) => ({
            term: item.term,
            detail: item.evidence?.text ?? "",
          }))}
        />
        <KeywordList
          title="Gap, don't claim this"
          empty="No unsupported keywords stood out."
          items={match.score.gaps.map((item) => ({
            term: item.term,
            detail: item.importance === "required" ? "Required on the posting" : "Preferred on the posting",
          }))}
        />

        {!match.schemaReady ? (
          <p className="text-xs text-amber-800">
            Scores are calculated in the app. Apply migration 0022_resume_job_scores.sql before they can be saved.
          </p>
        ) : null}

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              loading={isPending}
              disabled={!match.aiAvailable || !match.schemaReady}
              onClick={() =>
                run(async () => {
                  try {
                    const result = await generateResumeMatchSuggestions(jobId, match.source);
                    setSuggestions(result.suggestions);
                    setAccepted({});
                    setNotice(result.notice);
                    toast({ title: result.cached ? "Saved suggestions" : "Suggestions ready", description: result.notice ?? undefined });
                  } catch (error) {
                    toast({
                      title: "Suggestions failed",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  }
                })
              }
            >
              AI suggestions
            </Button>
            <p className="text-xs text-muted-foreground">
              Optional {match.model} call. Cached for this resume and posting. Cost is stored on the AI run.
              {!match.aiAvailable ? " Set OPENAI_API_KEY to enable it." : ""}
            </p>
          </div>
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          {suggestions.length > 0 ? (
            <ul className="space-y-3">
              {suggestions.map((suggestion) => (
                <li key={suggestion.bulletId} className="rounded-md border border-border p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={Boolean(accepted[suggestion.bulletId])}
                      onChange={(event) =>
                        setAccepted((current) => ({
                          ...current,
                          [suggestion.bulletId]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <span className="font-medium">Suggested bullet</span>
                      <span className="mt-1 block text-muted-foreground">{suggestion.originalText}</span>
                      <span className="mt-1 block">{suggestion.suggestedText}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Keywords: {suggestion.keywords.join(", ")}
                      </span>
                      {suggestion.evidence[0] ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Evidence ({suggestion.evidence[0].sourceType}): {suggestion.evidence[0].text}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            disabled={selected.length === 0}
            loading={isPending}
            onClick={() =>
              run(async () => {
                try {
                  const next = await applyResumeMatchSuggestions(
                    jobId,
                    selected.map((suggestion) => ({
                      bulletId: suggestion.bulletId,
                      suggestedText: suggestion.suggestedText,
                      keywords: suggestion.keywords,
                    }))
                  );
                  setMatch(next);
                  setSuggestions(next.suggestions);
                  setAccepted({});
                  setNotice("Accepted rewrites are on the tailored resume.");
                  toast({
                    title: "Tailored resume updated",
                    description:
                      next.beforeScore != null && next.afterScore != null
                        ? `Score moved from ${next.beforeScore} to ${next.afterScore}.`
                        : "Open Documents to export it.",
                  });
                } catch (error) {
                  toast({
                    title: "Could not apply suggestions",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            Apply to tailored resume
          </Button>
          <p className="text-xs text-muted-foreground">
            Accepted bullets are saved on the tailored resume for this job.{" "}
            <Link href={`/jobs/${jobId}?tab=documents`} className="text-primary underline">
              Export from Documents
            </Link>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function KeywordList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ term: string; detail: string }>;
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.term} className="rounded-md border border-border px-3 py-2">
              <span className="font-medium">{item.term}</span>
              {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
