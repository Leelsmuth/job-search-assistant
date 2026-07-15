"use client";

import { useState, useTransition } from "react";
import {
  draftAnswer,
  saveApplicationAnswer,
  getApplicationAnswers,
} from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const COMMON_QUESTIONS = [
  "Why are you interested in this role?",
  "Why do you want to work at this company?",
  "Describe your React experience.",
  "Tell us about a complex technical challenge.",
  "Why are you looking for a new role?",
];

type SavedAnswer = {
  id: string;
  question: string;
  draftAnswer: string | null;
  evidenceIds?: string[] | null;
};

export function ApplicationQAPanel({
  jobId,
  applicationId: initialApplicationId,
  initialAnswers,
}: {
  jobId: string;
  applicationId?: string;
  initialAnswers: SavedAnswer[];
}) {
  const { toast } = useToast();
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  const [question, setQuestion] = useState(COMMON_QUESTIONS[0]);
  const [answer, setAnswer] = useState(
    initialAnswers.find((a) => a.question === COMMON_QUESTIONS[0])?.draftAnswer ?? ""
  );
  const [sourceTexts, setSourceTexts] = useState<string[]>([]);
  const [unsupportedClaims, setUnsupportedClaims] = useState<string[]>([]);
  const [savedAnswers, setSavedAnswers] = useState(initialAnswers);
  const [isPending, startTransition] = useTransition();
  const [showSources, setShowSources] = useState(false);

  function selectQuestion(q: string) {
    setQuestion(q);
    const existing = savedAnswers.find((a) => a.question === q);
    setAnswer(existing?.draftAnswer ?? "");
    setSourceTexts([]);
  }

  async function refreshAnswers(appId: string) {
    const updated = await getApplicationAnswers(appId);
    setSavedAnswers(updated);
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Question</Label>
        <select
          className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          value={question}
          onChange={(e) => selectQuestion(e.target.value)}
        >
          {COMMON_QUESTIONS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Drafts use your profile evidence. With a valid OPENAI_API_KEY you get AI-written answers;
        otherwise a template draft is generated for you to edit. An application record is created
        when you first draft or save an answer.
      </p>
      <div className="flex gap-2">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await draftAnswer(jobId, question, applicationId);
                setApplicationId(result.applicationId);
                setAnswer(result.answer);
                setSourceTexts(result.evidenceTexts ?? []);
                setUnsupportedClaims(result.unsupportedClaims ?? []);
                setShowSources((result.evidenceTexts?.length ?? 0) > 0);
                await refreshAnswers(result.applicationId);
                toast({ title: "Draft generated and saved" });
              } catch (e) {
                toast({
                  title: "Draft failed",
                  description: e instanceof Error ? e.message : "Unknown error",
                  variant: "destructive",
                });
              }
            })
          }
        >
          {isPending ? "Drafting..." : "Draft Answer"}
        </Button>
        <Button
          variant="outline"
          disabled={isPending || !answer.trim()}
          onClick={() =>
            startTransition(async () => {
              try {
                const appId = await saveApplicationAnswer(
                  jobId,
                  question,
                  answer,
                  applicationId
                );
                setApplicationId(appId);
                await refreshAnswers(appId);
                toast({ title: "Answer saved" });
              } catch (e) {
                toast({
                  title: "Save failed",
                  description: e instanceof Error ? e.message : "Unknown error",
                  variant: "destructive",
                });
              }
            })
          }
        >
          Save Edits
        </Button>
      </div>
      <div>
        <Label>Draft (review and edit before submitting)</Label>
        <Textarea
          className="mt-1"
          rows={8}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Generated answer will appear here..."
        />
      </div>
      {unsupportedClaims.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Review these before submitting</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {unsupportedClaims.map((claim, i) => (
              <li key={i}>{claim}</li>
            ))}
          </ul>
        </div>
      )}
      {sourceTexts.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => setShowSources((v) => !v)}
          >
            {showSources ? "Hide sources" : "Show sources"} ({sourceTexts.length})
          </button>
          {showSources && (
            <ul className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              {sourceTexts.map((text, i) => (
                <li key={i} className="text-muted-foreground">
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {savedAnswers.length > 0 && (
        <div className="space-y-2">
          <Label>Saved answers</Label>
          {savedAnswers.map((a) => (
            <button
              key={a.id}
              type="button"
              className="block w-full rounded-md border border-border p-2 text-left text-sm hover:bg-accent/50"
              onClick={() => selectQuestion(a.question)}
            >
              <span className="font-medium">{a.question}</span>
              <p className="mt-1 truncate text-muted-foreground">{a.draftAnswer}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
