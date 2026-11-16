import Link from "next/link";
import { Briefcase, ClipboardList, FileText, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DemoCta } from "./demo/demo-cta";

/**
 * Public landing page. Signed-in visitors are redirected to /jobs by the
 * middleware, so this only renders for people who are not signed in.
 */
const FEATURES = [
  {
    icon: Briefcase,
    title: "A job feed ranked for you",
    body: "Roles from the company boards you follow, scored against your skills and experience, with the gaps called out.",
    inDemo: true,
  },
  {
    icon: ClipboardList,
    title: "An application tracker",
    body: "Move roles from saved to applied to interviewing in a list or board view, with notes and follow-up reminders.",
    inDemo: true,
  },
  {
    icon: FileText,
    title: "Tailored resumes and cover letters",
    body: "Drafts built from your own profile. Claims without evidence are flagged, never invented.",
    inDemo: false,
  },
  {
    icon: ShieldCheck,
    title: "Private-first and human-reviewed",
    body: "Your resume and answers are treated as sensitive data. You review everything, and the app never submits an application for you.",
    inDemo: false,
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Logo wordmark="always" size="sm" />
          <Button asChild variant="ghost" size="sm" className="min-h-10">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Find roles that fit, and keep track of every application
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Job Search Assistant pulls jobs from the company boards you choose, scores each one
            against your profile, and tracks your applications from first save to offer.
          </p>
          <DemoCta className="mt-8" />
        </section>

        <section aria-labelledby="features-heading" className="border-t border-border bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
            <h2 id="features-heading" className="sr-only">
              Features
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body, inDemo }) => (
                <li key={title} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <h3 className="font-semibold">{title}</h3>
                    {inDemo ? (
                      <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">
                        In the demo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
