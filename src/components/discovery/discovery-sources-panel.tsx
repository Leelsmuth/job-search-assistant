"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setDiscoverySourceEnabled } from "@/server/actions/discovery-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  DISCOVERY_SOURCE_IDS,
  SOURCE_LABELS,
  sourceCredit,
  type DiscoverySourceId,
} from "@/modules/discovery/source-catalog";

export function DiscoverySourcesPanel({
  enabled,
}: {
  enabled: Record<DiscoverySourceId, boolean>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Discovery sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The daily poll skips a source when it is off. Boards you follow yourself still run.
          Adzuna stays off until both API keys are set and you enable it here.
        </p>
        <ul className="space-y-2">
          {DISCOVERY_SOURCE_IDS.map((id) => {
            const credit = sourceCredit(id);
            return (
              <li key={id} className="flex items-start justify-between gap-3">
                <label htmlFor={`source-${id}`} className="min-w-0 text-sm">
                  <span className="font-medium">{SOURCE_LABELS[id]}</span>
                  {credit ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      <a href={credit.href} target="_blank" rel="noopener" className="underline">
                        {credit.name}
                      </a>
                      . {credit.applyNote}
                    </span>
                  ) : null}
                </label>
                <input
                  id={`source-${id}`}
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={enabled[id]}
                  disabled={pendingId === id}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setPendingId(id);
                    setDiscoverySourceEnabled(id, next)
                      .then(() => {
                        router.refresh();
                      })
                      .catch((error: unknown) => {
                        toast({
                          title: "Could not update source",
                          description: error instanceof Error ? error.message : "Unknown error",
                          variant: "destructive",
                        });
                      })
                      .finally(() => setPendingId(null));
                  }}
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
