"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSavedBoard, signOut } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

type Board = {
  id: string;
  companyName: string;
  boardUrl: string;
  provider: string;
};

export function SettingsClient({ initialBoards }: { initialBoards: Board[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [companyName, setCompanyName] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
  const [provider, setProvider] = useState<"greenhouse" | "lever">("greenhouse");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved Job Boards (V1 Discovery)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {initialBoards.length > 0 ? (
            <ul className="space-y-2">
              {initialBoards.map((board) => (
                <li
                  key={board.id}
                  className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{board.companyName}</p>
                    <p className="text-xs text-muted-foreground">{board.boardUrl}</p>
                  </div>
                  <span className="text-xs uppercase text-muted-foreground">
                    {board.provider}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No saved boards yet.</p>
          )}
          <div>
            <Label>Company Name</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <Label>Board URL</Label>
            <Input
              value={boardUrl}
              onChange={(e) => setBoardUrl(e.target.value)}
              placeholder="https://boards.greenhouse.io/company"
            />
          </div>
          <div>
            <Label>Provider</Label>
            <select
              className="w-full rounded-md border border-input px-3 py-2 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value as "greenhouse" | "lever")}
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
            </select>
          </div>
          <Button
            disabled={isPending || !companyName || !boardUrl}
            onClick={() =>
              startTransition(async () => {
                try {
                  await addSavedBoard({ companyName, boardUrl, provider });
                  setCompanyName("");
                  setBoardUrl("");
                  router.refresh();
                  toast({ title: "Board saved" });
                } catch (e) {
                  toast({
                    title: "Failed to save board",
                    description: e instanceof Error ? e.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            Add Board
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => startTransition(() => signOut())}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
