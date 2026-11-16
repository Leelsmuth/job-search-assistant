import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16 sm:px-10">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
        Job Search Assistant
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
        Find roles worth applying to and keep track of where each application stands.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/demo">Try the demo <ArrowRight size={16} aria-hidden="true" /></Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
      <div className="mt-12 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
        <section className="space-y-2">
          <BriefcaseBusiness size={20} aria-hidden="true" />
          <h2 className="font-semibold">Job feed</h2>
          <p className="text-sm text-muted-foreground">Browse sample openings and save the ones you want to track.</p>
        </section>
        <section className="space-y-2">
          <ListChecks size={20} aria-hidden="true" />
          <h2 className="font-semibold">Application tracker</h2>
          <p className="text-sm text-muted-foreground">See saved jobs and update their status as you apply.</p>
        </section>
      </div>
    </main>
  );
}
