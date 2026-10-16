"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addSavedBoard, detectBoardProviderAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import {
  PASTEABLE_BOARD_PROVIDERS,
  SOURCE_LABELS,
  isPasteableBoardProvider,
  type PasteableBoardProvider,
} from "@/modules/discovery/source-catalog";

export function PasteBoardForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const [companyName, setCompanyName] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [provider, setProvider] = useState<PasteableBoardProvider>("workday");
  const [detectHint, setDetectHint] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = boardUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setDetectHint(null);
      return;
    }

    const timer = setTimeout(() => {
      detectBoardProviderAction(trimmed)
        .then((result) => {
          if (isPasteableBoardProvider(result.provider)) {
            setProvider(result.provider);
            setDetectHint(result.reason);
          } else {
            setDetectHint("URL does not look like a supported careers board");
          }
        })
        .catch(() => setDetectHint(null));
    }, 400);

    return () => clearTimeout(timer);
  }, [boardUrl]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Paste a careers link</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Add a Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee, BambooHR,
          Teamtailor, Personio, or Rippling board. Use the company board, not a single posting.
        </p>
        <div>
          <Label htmlFor="discovery-company">Company name</Label>
          <Input
            id="discovery-company"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="discovery-board-url">Careers URL</Label>
          <Input
            id="discovery-board-url"
            value={boardUrl}
            onChange={(event) => {
              setBoardUrl(event.target.value);
              setBoardError(null);
            }}
            placeholder="https://company.wd3.myworkdayjobs.com/careers"
            aria-invalid={boardError ? true : undefined}
            aria-describedby={boardError ? "discovery-board-error" : undefined}
          />
          {boardError ? (
            <p id="discovery-board-error" role="alert" className="mt-1 text-sm text-destructive">
              {boardError}
            </p>
          ) : null}
          {detectHint ? <p className="mt-1 text-xs text-muted-foreground">{detectHint}</p> : null}
        </div>
        <div>
          <Label htmlFor="discovery-provider">Provider</Label>
          <select
            id="discovery-provider"
            className="w-full rounded-md border border-input px-3 py-2 text-sm"
            value={provider}
            onChange={(event) => setProvider(event.target.value as PasteableBoardProvider)}
          >
            {PASTEABLE_BOARD_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {SOURCE_LABELS[id]}
              </option>
            ))}
          </select>
        </div>
        <Button
          loading={isKeyPending("discovery-add-board")}
          disabled={!companyName.trim() || !boardUrl.trim()}
          onClick={() =>
            run("discovery-add-board", async () => {
              const result = await addSavedBoard({ companyName, boardUrl, provider });
              if (!result.ok) {
                setBoardError(result.error);
                return;
              }
              setCompanyName("");
              setBoardUrl("");
              setBoardError(null);
              setDetectHint(null);
              router.refresh();
              toast({ title: "Board saved" });
            })
          }
        >
          {isKeyPending("discovery-add-board") ? "Adding..." : "Follow board"}
        </Button>
      </CardContent>
    </Card>
  );
}
