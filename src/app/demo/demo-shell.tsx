"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, ClipboardList, RotateCcw } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ToasterProvider, useToast } from "@/components/ui/use-toast";
import { ActionPendingProvider } from "@/components/layout/action-pending-provider";
import {
  TrackerAdapterProvider,
  type TrackerAdapter,
} from "@/components/applications/tracker-adapter";
import { cn } from "@/lib/utils";
import { isDemoStatePristine } from "@/modules/demo/demo-state";
import { demoActions, useDemoState } from "./demo-store";
import { DEMO_FEED_HREF, DEMO_TRACKER_HREF, demoJobHref } from "./demo-links";

/** Backs the shared tracker UI with the browser store instead of server actions. */
const demoTrackerAdapter: TrackerAdapter = {
  updateStatus: async (id, status) => demoActions.setStatus(id, status),
  updateNotes: async (id, notes) => demoActions.setNotes(id, notes),
  updateFollowUp: async (id, date) => demoActions.setFollowUp(id, date),
  updateAppliedDate: async (id, date) => demoActions.setAppliedDate(id, date),
  // The demo has no separate application page; the job page shows the tracker controls.
  applicationHref: (application) => demoJobHref(application.jobId),
  jobHref: (application) => demoJobHref(application.jobId),
};

export function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <ToasterProvider>
      <ActionPendingProvider>
        <TrackerAdapterProvider adapter={demoTrackerAdapter}>
          <div className="flex min-h-screen flex-col">
            <DemoHeader />
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">
              <p className="mx-auto max-w-6xl">
                <span className="font-semibold">Demo mode.</span> Fictional jobs. Changes stay in
                this browser and are never sent to a server.{" "}
                <Link href="/login" className="font-medium underline underline-offset-2">
                  Sign in
                </Link>{" "}
                to use your own data.
              </p>
            </div>
            <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
              {children}
            </main>
          </div>
        </TrackerAdapterProvider>
      </ActionPendingProvider>
    </ToasterProvider>
  );
}

const NAV = [
  { href: DEMO_FEED_HREF, label: "Job feed", icon: Briefcase },
  { href: DEMO_TRACKER_HREF, label: "Applications", icon: ClipboardList },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === DEMO_FEED_HREF) return pathname === DEMO_FEED_HREF || pathname.startsWith("/demo/jobs/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DemoHeader() {
  const pathname = usePathname();
  const state = useDemoState();
  const trackedCount = state?.applications.length ?? null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" aria-label="Job Search Assistant home" className="shrink-0">
          <Logo wordmark="responsive" size="sm" />
        </Link>
        <nav aria-label="Demo" className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm transition-colors sm:flex-none",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
                {href === DEMO_TRACKER_HREF && trackedCount != null ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs",
                      active ? "bg-primary-foreground/20" : "bg-muted"
                    )}
                  >
                    {trackedCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ResetDemoButton />
          <Button asChild size="sm" className="min-h-10">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function ResetDemoButton() {
  const { toast } = useToast();
  const state = useDemoState();
  // Nothing to reset before hydration or while the demo is still as seeded.
  const pristine = !state || isDemoStatePristine(state);

  // Disabled buttons ignore pointer events, so the hint lives on a wrapper.
  return (
    <span title={pristine ? "Nothing to reset yet" : undefined}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10"
        disabled={pristine}
        onClick={() => {
          const previous = demoActions.reset();
          if (!previous) return;
          toast({
            title: "Demo reset",
            description: "Sample jobs and applications are back to the start.",
            action: { label: "Undo", onClick: () => demoActions.restore(previous) },
          });
        }}
      >
        {/* Button wraps children in one span; keep the icon inline with the label. */}
        <span className="inline-flex items-center gap-1.5">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset demo
        </span>
      </Button>
    </span>
  );
}
