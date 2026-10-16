"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setInstantAlertsEnabled } from "@/server/actions/alert-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

export function AlertSettingsForm({
  enabled,
  dailyCap,
  schemaReady,
}: {
  enabled: boolean;
  dailyCap: number;
  schemaReady: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = useState(enabled);
  const [cap, setCap] = useState(String(dailyCap));
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Instant alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          When a role shows up within a day of being posted and clears your digest minimum, send one
          email for the batch. Quiet hours are 10:00 PM–7:00 AM America/Toronto. Alerts that land
          overnight wait until 7:00 AM. Each role is emailed once. Read them on the{" "}
          <Link href="/alerts" className="text-primary underline">
            alerts page
          </Link>
          .
        </p>
        {schemaReady ? (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={on}
                onChange={(event) => setOn(event.target.checked)}
              />
              <span>Email me as soon as a fresh match is found</span>
            </label>
            <div>
              <Label htmlFor="alert-cap">Daily cap</Label>
              <Input
                id="alert-cap"
                inputMode="numeric"
                className="mt-1 max-w-32"
                value={cap}
                onChange={(event) => setCap(event.target.value)}
              />
            </div>
            <Button
              type="button"
              loading={pending}
              onClick={() => {
                setPending(true);
                const parsed = Number(cap);
                setInstantAlertsEnabled(on, Number.isNaN(parsed) ? dailyCap : parsed)
                  .then(() => {
                    router.refresh();
                    toast({ title: on ? "Instant alerts on" : "Instant alerts off" });
                  })
                  .catch((error: unknown) => {
                    toast({
                      title: "Could not save alert setting",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  })
                  .finally(() => setPending(false));
              }}
            >
              {pending ? "Saving..." : "Save alert setting"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Apply <code>drizzle/migrations/0023_discovery_tick_and_alerts.sql</code> in the Supabase
            SQL editor before turning instant alerts on or off.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
