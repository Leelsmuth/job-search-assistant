"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewJobImportAction,
  confirmJobImportAction,
} from "@/server/actions";
import type { NormalizedJob } from "@/modules/ingestion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { mapImportError } from "@/lib/import-errors";

type ImportMeta = {
  provider: string;
  sourceUrl?: string;
  sourceJobId?: string;
  rawPayload?: unknown;
};

export default function ImportJobPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<NormalizedJob | null>(null);
  const [meta, setMeta] = useState<ImportMeta | null>(null);

  function handlePreview(input: string) {
    setError("");
    setPreview(null);
    startTransition(async () => {
      try {
        const result = await previewJobImportAction(input);
        setPreview(result.normalized);
        setMeta({
          provider: result.provider,
          sourceUrl: result.sourceUrl,
          sourceJobId: result.sourceJobId,
          rawPayload: result.rawPayload,
        });
      } catch (e) {
        const msg = mapImportError(e instanceof Error ? e.message : "Preview failed");
        setError(msg);
        toast({ title: "Import failed", description: msg, variant: "destructive" });
      }
    });
  }

  function handleConfirm() {
    if (!preview || !meta) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await confirmJobImportAction(preview, meta);
        toast({ title: "Job imported", description: "Match analysis complete." });
        router.push(`/jobs/${result.jobId}`);
      } catch (e) {
        const msg = mapImportError(e instanceof Error ? e.message : "Save failed");
        setError(msg);
        toast({ title: "Save failed", description: msg, variant: "destructive" });
      }
    });
  }

  function updatePreview(field: keyof NormalizedJob, value: string | string[]) {
    if (!preview) return;
    setPreview({ ...preview, [field]: value });
  }

  if (preview && meta) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Review Import</h1>
        <p className="text-sm text-muted-foreground">
          Edit normalized fields before saving and running match analysis.
        </p>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <Label>Company</Label>
              <Input
                value={preview.company}
                onChange={(e) => updatePreview("company", e.target.value)}
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={preview.title}
                onChange={(e) => updatePreview("title", e.target.value)}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={preview.location ?? ""}
                onChange={(e) => updatePreview("location", e.target.value)}
              />
            </div>
            <div>
              <Label>Workplace Type</Label>
              <select
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                value={preview.workplaceType ?? "unknown"}
                onChange={(e) => updatePreview("workplaceType", e.target.value)}
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="on_site">On-site</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div>
              <Label>Technologies (comma-separated)</Label>
              <Input
                value={preview.technologies.join(", ")}
                onChange={(e) =>
                  updatePreview(
                    "technologies",
                    e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                  )
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={preview.description}
                onChange={(e) => updatePreview("description", e.target.value)}
                rows={10}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConfirm} disabled={isPending}>
                {isPending ? "Saving..." : "Save & Match"}
              </Button>
              <Button variant="outline" onClick={() => { setPreview(null); setMeta(null); }}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Import Job</h1>
      <Tabs defaultValue="paste">
        <TabsList>
          <TabsTrigger value="paste">Paste Description</TabsTrigger>
          <TabsTrigger value="url">URL</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
        </TabsList>
        <TabsContent value="paste">
          <ImportForm
            label="Job Description"
            placeholder="Paste the full job description..."
            onSubmit={handlePreview}
            isPending={isPending}
            multiline
          />
        </TabsContent>
        <TabsContent value="url">
          <ImportForm
            label="Job URL"
            placeholder="https://boards.greenhouse.io/..."
            onSubmit={handlePreview}
            isPending={isPending}
          />
        </TabsContent>
        <TabsContent value="manual">
          <ManualJobForm onSubmit={handlePreview} isPending={isPending} />
        </TabsContent>
      </Tabs>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ImportForm({
  label,
  placeholder,
  onSubmit,
  isPending,
  multiline,
}: {
  label: string;
  placeholder: string;
  onSubmit: (input: string) => void;
  isPending: boolean;
  multiline?: boolean;
}) {
  const [value, setValue] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {multiline ? (
          <Textarea
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={12}
          />
        ) : (
          <Input
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <Button
          onClick={() => onSubmit(value)}
          disabled={!value.trim() || isPending}
        >
          {isPending ? "Parsing..." : "Preview Import"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ManualJobForm({
  onSubmit,
  isPending,
}: {
  onSubmit: (input: string) => void;
  isPending: boolean;
}) {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <Label>Company</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
          />
        </div>
        <Button
          onClick={() =>
            onSubmit(
              JSON.stringify({
                company,
                title,
                description,
                responsibilities: [],
                requiredQualifications: [],
                preferredQualifications: [],
                technologies: [],
              })
            )
          }
          disabled={!company || !title || !description || isPending}
        >
          {isPending ? "Parsing..." : "Preview Import"}
        </Button>
      </CardContent>
    </Card>
  );
}
