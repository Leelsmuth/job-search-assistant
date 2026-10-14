"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setDigestEmailsEnabled } from "@/server/actions/digest-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { formatTorontoDateTime } from "@/modules/digest/time";

export function DigestSettingsForm({
  emailsEnabled,
  schemaReady,
  lastSentAt,
}: {
  emailsEnabled: boolean;
  schemaReady: boolean;
  lastSentAt: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(emailsEnabled);
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily digest</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Each morning, collect up to 10 new frontend matches that fit your location rules
          (remote anywhere in Canada, hybrid and on-site only in Toronto and the GTA) and
          tracker reminders. Read it on the{" "}
          <Link href="/digest" className="text-primary underline">
            digest page
          </Link>{" "}
          even when email is off. Nothing is sent when there are no new matches and no reminders.
        </p>
        {schemaReady ? (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              <span>Email me the daily digest</span>
            </label>
            <p className="text-xs text-muted-foreground">
              {lastSentAt
                ? `Last email ${formatTorontoDateTime(new Date(lastSentAt))}.`
                : "No digest email has been sent yet."}
            </p>
            <Button
              type="button"
              loading={pending}
              onClick={() => {
                setPending(true);
                setDigestEmailsEnabled(enabled)
                  .then(() => {
                    router.refresh();
                    toast({ title: enabled ? "Digest email on" : "Digest email off" });
                  })
                  .catch((error: unknown) => {
                    toast({
                      title: "Could not save digest setting",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  })
                  .finally(() => setPending(false));
              }}
            >
              {pending ? "Saving..." : "Save digest setting"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Apply <code>drizzle/migrations/0016_job_digests.sql</code> in the Supabase SQL editor
            before turning digest email on or off.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
