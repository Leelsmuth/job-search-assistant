import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { createHash } from "crypto";

export function parseOptionalInt(
  value: string | number | null | undefined
): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hashInput(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency = "CAD"
): string | null {
  if (!min && !max) return null;
  if (min && max) return `${currency} $${min.toLocaleString()} – $${max.toLocaleString()}`;
  if (min) return `${currency} $${min.toLocaleString()}+`;
  return `Up to ${currency} $${max!.toLocaleString()}`;
}

export const MATCH_CLASSIFICATIONS = [
  "excellent",
  "strong",
  "possible",
  "stretch",
  "poor",
] as const;

export type MatchClassification = (typeof MATCH_CLASSIFICATIONS)[number];

export const APPLICATION_STATUSES = [
  "discovered",
  "reviewing",
  "saved",
  "preparing",
  "ready_to_apply",
  "applied",
  "recruiter_screen",
  "technical_interview",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export function classificationColor(c: MatchClassification): string {
  const map: Record<MatchClassification, string> = {
    excellent: "bg-emerald-100 text-emerald-800",
    strong: "bg-green-100 text-green-800",
    possible: "bg-yellow-100 text-yellow-800",
    stretch: "bg-orange-100 text-orange-800",
    poor: "bg-red-100 text-red-800",
  };
  return map[c];
}

export function humanizeMatchStatus(status: string): string {
  const labels: Record<string, string> = {
    confirmed: "Confirmed",
    transferable: "Transferable",
    missing_evidence: "Missing evidence",
    gap: "Gap",
    blocked: "Blocked",
    partial: "Partial",
    unknown: "Unknown",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

export function formatMatchScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return `${Math.round(score)}%`;
}
