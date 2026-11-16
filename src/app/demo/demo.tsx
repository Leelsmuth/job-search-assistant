"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { statusLabel, TRACKER_STAGES, type TrackerStage } from "@/modules/applications/tracker";
import {
  demoJobs,
  emptyDemoSnapshot,
  parseDemoSnapshot,
  readDemoSnapshot,
  subscribeToDemo,
  updateDemo,
  type DemoJob,
} from "./demo-state";

export function Demo({ view }: { view: "jobs" | "applications" }) {
  const snapshot = useSyncExternalStore(subscribeToDemo, readDemoSnapshot, emptyDemoSnapshot);
  const state = parseDemoSnapshot(snapshot);
  const [notice, setNotice] = useState("");
  const isFeed = view === "jobs";

  function toggleSaved(job: DemoJob) {
    updateDemo((current) => {
      const entry = current[job.id];
      return {
        ...current,
        [job.id]: { saved: !entry?.saved, status: entry?.status ?? "saved" },
      };
    });
    setNotice("");
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <Link href="/" className="font-semibold hover:underline">Job Search Assistant</Link>
          <p className="mt-1 text-sm text-muted-foreground">Demo with sample jobs. Changes stay in this browser.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            updateDemo(() => ({}));
            setNotice("Demo reset.");
          }} disabled={Object.keys(state).length === 0}>
            Reset demo
          </Button>
          <Button asChild variant="ghost"><Link href="/login">Sign in</Link></Button>
        </div>
      </header>
      <nav aria-label="Demo navigation" className="my-5 flex flex-wrap gap-2">
        <Button asChild variant={isFeed ? "default" : "ghost"}>
          <Link href="/demo" aria-current={isFeed ? "page" : undefined}>Job feed</Link>
        </Button>
        <Button asChild variant={isFeed ? "ghost" : "default"}>
          <Link href="/demo/applications" aria-current={isFeed ? undefined : "page"}>Application tracker</Link>
        </Button>
      </nav>
      <p role="status" className={notice ? "mb-3 text-sm text-muted-foreground" : "sr-only"}>{notice}</p>

      {isFeed ? (
        <section aria-labelledby="feed-heading" className="space-y-3">
          <h1 id="feed-heading" className="mb-4 text-2xl font-semibold">Job feed</h1>
          {demoJobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div>
                  <h2 className="font-semibold">{job.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{job.company} · {job.location}</p>
                  <p className="mt-2 text-sm">{job.description}</p>
                </div>
                <Button variant="outline" aria-label={`${state[job.id]?.saved ? "Unsave" : "Save"} ${job.title}`} onClick={() => toggleSaved(job)}>
                  {state[job.id]?.saved ? "Unsave" : "Save"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <section aria-labelledby="tracker-heading" className="space-y-3">
          <h1 id="tracker-heading" className="mb-4 text-2xl font-semibold">Application tracker</h1>
          {Object.keys(state).length === 0 && (
            <p className="text-sm text-muted-foreground">Save a job from the feed to start tracking it.</p>
          )}
          {demoJobs.map((job) => {
            const entry = state[job.id];
            if (!entry) return null;
            return (
              <Card key={job.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                  <div>
                    <h2 className="font-semibold">{job.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{job.company} · {job.location}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    Status
                    <select
                      aria-label={`Status for ${job.title}`}
                      className="rounded-md border border-input bg-background px-2 py-1.5"
                      value={entry.status}
                      onChange={(event) => {
                        const status = event.target.value as TrackerStage;
                        updateDemo((current) => {
                          const latestEntry = current[job.id];
                          return latestEntry ? { ...current, [job.id]: { ...latestEntry, status } } : current;
                        });
                        setNotice("");
                      }}
                    >
                      {TRACKER_STAGES.map((stage) => (
                        <option key={stage} value={stage}>{statusLabel(stage)}</option>
                      ))}
                    </select>
                  </label>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </main>
  );
}
