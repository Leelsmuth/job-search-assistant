"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DemoLiveJob } from "@/modules/demo/live-jobs";

export const SIGN_UP_HREF = "/login?mode=signup";
export const SIGN_IN_HREF = "/login";

const BENEFITS = [
  "Track it from saved to applied to offer, with follow-up reminders",
  "See how it scores against your resume, with the gaps called out",
  "Follow company boards and get a morning digest of new matches",
] as const;

/**
 * Shown when a visitor tries to save a live job. The demo tracker holds sample
 * jobs only, so this is where the demo asks them to sign up or sign in.
 * The trigger is the row's Save button; Radix returns focus to it on close.
 */
export function DemoSignInPrompt({
  job,
  trigger,
}: {
  job: DemoLiveJob;
  trigger: React.ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg focus:outline-none">
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </Dialog.Close>
          <Dialog.Title className="pr-8 text-lg font-semibold">Save real jobs to your own tracker</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {job.title} at {job.company}
            </span>{" "}
            is a live posting. The demo tracker only holds sample jobs, so saving real ones needs an
            account.
          </Dialog.Description>
          <ul className="mt-4 space-y-2 text-sm">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="min-h-10 sm:flex-1">
              <Link href={SIGN_UP_HREF}>Create an account</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-10 sm:flex-1">
              <Link href={SIGN_IN_HREF}>Sign in</Link>
            </Button>
          </div>
          <Dialog.Close asChild>
            <Button variant="ghost" className="mt-2 min-h-10 w-full">
              Keep exploring the demo
            </Button>
          </Dialog.Close>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            No account needed to{" "}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              read the posting
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
