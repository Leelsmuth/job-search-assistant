import { formatJobDescription } from "@/modules/ingestion/html-text";

export function JobDescription({ text }: { text: string }) {
  const formatted = formatJobDescription(text);

  return (
    <div className="mt-4 max-h-[32rem] overflow-y-auto rounded-md border border-border bg-muted/20 p-4">
      <div className="whitespace-pre-wrap font-normal text-sm leading-relaxed text-foreground">
        {formatted}
      </div>
    </div>
  );
}
