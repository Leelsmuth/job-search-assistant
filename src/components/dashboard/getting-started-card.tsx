import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Progress = {
  hasProfile: boolean;
  hasBoards: boolean;
  hasJobs: boolean;
  hasApplications: boolean;
};

const STEPS = [
  {
    key: "hasProfile" as const,
    label: "Complete your profile",
    href: "/profile",
    cta: "Edit profile",
  },
  {
    key: "hasBoards" as const,
    label: "Add company boards to follow",
    href: "/discovery",
    cta: "Browse catalog",
  },
  {
    key: "hasJobs" as const,
    label: "Import or discover jobs",
    href: "/settings",
    cta: "Poll boards",
  },
  {
    key: "hasApplications" as const,
    label: "Track an application",
    href: "/jobs",
    cta: "Browse jobs",
  },
];

export function GettingStartedCard({ progress }: { progress: Progress }) {
  const complete = STEPS.filter((s) => progress[s.key]).length;
  const allDone = complete === STEPS.length;

  if (allDone) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Getting started</CardTitle>
        <p className="text-sm text-muted-foreground">
          {complete} of {STEPS.length} steps complete
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {STEPS.map((step) => {
          const done = progress[step.key];
          return (
            <div key={step.key} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={done ? "text-muted-foreground line-through" : ""}>
                  {step.label}
                </span>
              </div>
              {!done && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={step.href}>{step.cta}</Link>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
