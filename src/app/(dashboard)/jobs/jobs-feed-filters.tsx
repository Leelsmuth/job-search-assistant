"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function JobsFeedFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/jobs?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border p-4">
      <div>
        <Label className="text-xs">Min Score</Label>
        <select
          className="mt-1 block rounded-md border border-input px-2 py-1 text-sm"
          value={params.get("minScore") ?? ""}
          onChange={(e) => update("minScore", e.target.value)}
        >
          <option value="">Any</option>
          <option value="60">60+</option>
          <option value="75">75+</option>
          <option value="85">85+</option>
        </select>
      </div>
      <div>
        <Label className="text-xs">Classification</Label>
        <select
          className="mt-1 block rounded-md border border-input px-2 py-1 text-sm"
          value={params.get("classification") ?? ""}
          onChange={(e) => update("classification", e.target.value)}
        >
          <option value="">All</option>
          <option value="excellent">Excellent</option>
          <option value="strong">Strong</option>
          <option value="possible">Possible</option>
          <option value="stretch">Stretch</option>
          <option value="poor">Poor</option>
        </select>
      </div>
      <div>
        <Label className="text-xs">Sort</Label>
        <select
          className="mt-1 block rounded-md border border-input px-2 py-1 text-sm"
          value={params.get("sort") ?? "match"}
          onChange={(e) => update("sort", e.target.value)}
        >
          <option value="match">Best Match</option>
          <option value="recent">Most Recent</option>
          <option value="salary">Highest Salary</option>
        </select>
      </div>
      <Button
        variant={params.get("remote") === "true" ? "default" : "outline"}
        size="sm"
        onClick={() =>
          update("remote", params.get("remote") === "true" ? "" : "true")
        }
      >
        Remote Only
      </Button>
      <Button
        variant={params.get("canada") === "true" ? "default" : "outline"}
        size="sm"
        onClick={() =>
          update("canada", params.get("canada") === "true" ? "" : "true")
        }
      >
        Canada
      </Button>
    </div>
  );
}
