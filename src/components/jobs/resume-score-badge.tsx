import { Badge } from "@/components/ui/badge";

export function ResumeScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  return (
    <Badge className="border border-border bg-transparent" title="How this resume matches the posting">
      ATS {score}
    </Badge>
  );
}
