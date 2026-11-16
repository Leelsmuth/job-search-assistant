import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { demoActivePrePaintScript } from "@/modules/demo/storage-keys";
import { DemoActivityGroup } from "./demo-activity-group";
import { DEMO_FEED_HREF } from "./demo-links";

const COPY = {
  fresh: {
    cta: "Try the demo",
    note: "The demo needs no account. It uses sample jobs, and your changes stay in your browser.",
  },
  returning: {
    cta: "Continue exploring your demo",
    note: "Welcome back. Your saved jobs and tracker changes are still here in this browser.",
  },
} as const;

/**
 * Landing page call to action. Visitors who have changed something in the demo
 * see "Continue" copy; everyone else sees "Try the demo".
 *
 * Both versions are server-rendered and CSS shows one, keyed off the wrapper's
 * data-demo attribute. This keeps the landing page static, avoids a flash of
 * the wrong copy, and keeps Button and the demo code out of its client bundle.
 */
export function DemoCta({ className }: { className?: string }) {
  return (
    <DemoActivityGroup className={cn("group", className)}>
      <script dangerouslySetInnerHTML={{ __html: demoActivePrePaintScript() }} />
      <CtaVariant variant="fresh" className="group-data-[demo=active]:hidden" />
      <CtaVariant variant="returning" className="hidden group-data-[demo=active]:block" />
    </DemoActivityGroup>
  );
}

function CtaVariant({ variant, className }: { variant: keyof typeof COPY; className: string }) {
  const copy = COPY[variant];
  return (
    <div className={className}>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
          <Link href={DEMO_FEED_HREF}>
            {copy.cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="min-h-11 w-full sm:w-auto">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{copy.note}</p>
    </div>
  );
}
