"use client";

import Link from "next/link";
import { addSavedBoardFromCatalog } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import type { CatalogEntry } from "@/components/discovery/company-catalog-panel";

export function SuggestedBoardsPanel({
  suggestions,
  followingUrls,
}: {
  suggestions: CatalogEntry[];
  followingUrls: Set<string>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();

  if (suggestions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suggested for you</CardTitle>
        <p className="text-sm text-muted-foreground">
          Boards with observed frontend and remote-Canada signals matching your profile.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {suggestions.map((entry) => {
            const following = followingUrls.has(entry.boardUrl);
            return (
              <li
                key={entry.boardUrl}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{entry.companyName}</p>
                    <Badge className="text-xs uppercase">{entry.atsProvider}</Badge>
                    {entry.observedSignals?.hasRemoteCanadaJobs ? (
                      <Badge className="text-xs">Remote CA</Badge>
                    ) : null}
                    {entry.observedSignals?.hasFrontendJobs ? (
                      <Badge className="text-xs">Frontend</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.lastJobCount ?? "?"} jobs
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={following ? "outline" : "default"}
                  loading={isKeyPending(`suggest-${entry.boardUrl}`)}
                  disabled={following}
                  onClick={() =>
                    run(`suggest-${entry.boardUrl}`, async () => {
                      try {
                        const result = await addSavedBoardFromCatalog(entry.id);
                        router.refresh();
                        toast({
                          title: result.alreadyFollowing ? "Already following" : "Board added",
                          description: entry.companyName,
                        });
                      } catch (e) {
                        toast({
                          title: "Failed to add board",
                          description: e instanceof Error ? e.message : "Unknown error",
                          variant: "destructive",
                        });
                      }
                    })
                  }
                >
                  {following ? "Following" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
        <Button variant="ghost" className="mt-3 h-auto p-0" asChild>
          <Link href="/discovery">Browse full catalog →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
