"use client";

import { useState } from "react";
import {
  draftAnswer,
  saveApplicationAnswer,
  getApplicationAnswers,
} from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";

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
  evidenceTexts?: string[];
  unsupportedClaims?: string[];
};

function hydrateAnswerState(answer: SavedAnswer | undefined) {
  return {
    answer: answer?.draftAnswer ?? "",
    sourceTexts: answer?.evidenceTexts ?? [],
    unsupportedClaims: answer?.unsupportedClaims ?? [],
    showSources: (answer?.evidenceTexts?.length ?? 0) > 0,
  };
}

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
  const [presetQuestion, setPresetQuestion] = useState(COMMON_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState("");
  const initialSaved = initialAnswers.find((a) => a.question === COMMON_QUESTIONS[0]);
  const initialState = hydrateAnswerState(initialSaved);
  const [answer, setAnswer] = useState(initialState.answer);
  const [sourceTexts, setSourceTexts] = useState<string[]>(initialState.sourceTexts);
  const [unsupportedClaims, setUnsupportedClaims] = useState<string[]>(
    initialState.unsupportedClaims
  );
  const [savedAnswers, setSavedAnswers] = useState(initialAnswers);
  const { run, isKeyPending } = useKeyedPending();
  const [showSources, setShowSources] = useState(initialState.showSources);

  const activeQuestion = customQuestion.trim() || presetQuestion;

  function selectQuestion(q: string) {
    if (COMMON_QUESTIONS.includes(q)) {
      setCustomQuestion("");
      setPresetQuestion(q);
    } else {
      setCustomQuestion(q);
      setPresetQuestion(COMMON_QUESTIONS[0]);
    }
    const existing = savedAnswers.find((a) => a.question === q);
    const next = hydrateAnswerState(existing);
    setAnswer(next.answer);
    setSourceTexts(next.sourceTexts);
    setUnsupportedClaims(next.unsupportedClaims);
    setShowSources(next.showSources);
  }

  async function refreshAnswers(appId: string) {
    const updated = await getApplicationAnswers(appId);
    setSavedAnswers(updated);
    const current = updated.find((a) => a.question === activeQuestion);
    if (current) {
      const next = hydrateAnswerState(current);
      setSourceTexts(next.sourceTexts);
      setUnsupportedClaims(next.unsupportedClaims);
      setShowSources(next.showSources);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Question</Label>
        <select
          className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          value={presetQuestion}
          onChange={(e) => selectQuestion(e.target.value)}
        >
          {COMMON_QUESTIONS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="custom-question">Or paste your own question</Label>
        <Input
          id="custom-question"
          className="mt-1"
          placeholder="Paste an application question from the job posting..."
          value={customQuestion}
          onChange={(e) => {
            const value = e.target.value;
            setCustomQuestion(value);
            if (value.trim()) {
              const existing = savedAnswers.find((a) => a.question === value.trim());
              const next = hydrateAnswerState(existing);
              setAnswer(next.answer);
              setSourceTexts(next.sourceTexts);
              setUnsupportedClaims(next.unsupportedClaims);
              setShowSources(next.showSources);
            }
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Drafts use your profile evidence. With a valid OPENAI_API_KEY you get AI-written answers;
        otherwise a template draft is generated for you to edit. An application record is created
        when you first draft or save an answer.
      </p>
      <div className="flex gap-2">
        <Button
          loading={isKeyPending("draft")}
          disabled={!activeQuestion.trim()}
          onClick={() =>
            run("draft", async () => {
              try {
                const result = await draftAnswer(jobId, activeQuestion, applicationId);
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
          {isKeyPending("draft") ? "Drafting..." : "Draft Answer"}
        </Button>
        <Button
          variant="outline"
          loading={isKeyPending("save")}
          disabled={!answer.trim() || !activeQuestion.trim()}
          onClick={() =>
            run("save", async () => {
              try {
                const result = await saveApplicationAnswer(
                  jobId,
                  activeQuestion,
                  answer,
                  applicationId
                );
                setApplicationId(result.applicationId);
                setUnsupportedClaims(result.unsupportedClaims ?? []);
                setSourceTexts(result.evidenceTexts ?? []);
                setShowSources((result.evidenceTexts?.length ?? 0) > 0);
                await refreshAnswers(result.applicationId);
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
          {isKeyPending("save") ? "Saving..." : "Save Edits"}
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
