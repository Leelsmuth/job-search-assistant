import { hashInput } from "@/lib/utils";
import type { ResumeScoreJob } from "@/modules/resume-score/types";

export function hashResumeText(text: string): string {
  return hashInput(text.trim()).slice(0, 32);
}

export function hashJobPosting(job: Pick<ResumeScoreJob, "title" | "description" | "technologies">): string {
  const technologies = [...(job.technologies ?? [])].map((item) => item.trim()).sort().join("|");
  return hashInput(`${job.title}\n${job.description ?? ""}\n${technologies}`).slice(0, 32);
}
