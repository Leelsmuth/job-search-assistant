"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { classificationColor } from "@/lib/utils";
import type { MatchClassification } from "@/lib/utils";

type AnalysisSummary = {
  id: string;
  overallScore: number | null;
  classification: string;
  topConcern: string | null;
  createdAt: Date;
};

export function MatchHistoryPanel({
  analyses,
  profileUpdatedAt,
}: {
  analyses: AnalysisSummary[];
  profileUpdatedAt: Date;
}) {
  if (analyses.length <= 1) return null;

  const [latest, ...previous] = analyses;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Match history</CardTitle>
        <p className="text-sm text-muted-foreground">
          Previous analyses — compare after profile updates.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {previous.map((analysis) => {
          const scoreDelta =
            (latest.overallScore ?? 0) - (analysis.overallScore ?? 0);
          const ranBeforeProfileUpdate =
            new Date(analysis.createdAt) < new Date(profileUpdatedAt);

          return (
            <div
              key={analysis.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {Math.round(analysis.overallScore ?? 0)}% match
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(analysis.createdAt).toLocaleDateString()}
                  </span>
                </p>
                {analysis.topConcern ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Top concern: {analysis.topConcern}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={classificationColor(
                    analysis.classification as MatchClassification
                  )}
                >
                  {analysis.classification}
                </Badge>
                {scoreDelta !== 0 && (
                  <Badge className="border border-border bg-transparent text-xs">
                    {scoreDelta > 0 ? "+" : ""}
                    {Math.round(scoreDelta)} vs latest
                  </Badge>
                )}
                {ranBeforeProfileUpdate && (
                  <Badge className="bg-amber-100 text-amber-900 text-xs">
                    pre-profile update
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
