"use client";

import Link from "next/link";
import { useState } from "react";
import { bookmarkletHref, bookmarkletSource } from "@/modules/apply/filler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

export default function ApplyAssistPage() {
  const { toast } = useToast();
  const href = bookmarkletHref();
  const source = bookmarkletSource();
  const [copied, setCopied] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/settings">← Settings</Link>
      </Button>
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Form filler</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fills known Greenhouse, Lever, and Ashby fields from a payload you copied on Prepare application.
          It does not upload files and it does not click Submit. You still review the employer form.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bookmarklet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Drag this link to your bookmarks bar, then open it on the employer application page.</p>
          <a
            href={href}
            className="inline-flex rounded-md border border-border px-3 py-2 font-medium"
            onClick={(event) => event.preventDefault()}
          >
            Fill application form
          </a>
          <ol className="list-decimal space-y-1 pl-5">
            <li>On Prepare application, choose Copy filler payload.</li>
            <li>Open the employer application in the same browser.</li>
            <li>Run the bookmarklet and paste the payload when asked.</li>
            <li>Check the fields, attach your resume yourself, then submit.</li>
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Console script</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If a bookmark is inconvenient, paste this into the employer page console. It is the same script.
          </p>
          <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">{source}</pre>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(source).then(() => {
                setCopied(true);
                toast({ title: copied ? "Copied again" : "Script copied" });
              });
            }}
          >
            Copy script
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
