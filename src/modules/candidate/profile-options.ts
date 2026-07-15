export const SENIORITY_OPTIONS = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "staff", label: "Staff / Principal" },
] as const;

export const REMOTE_PREFERENCE_OPTIONS = [
  { value: "remote", label: "Remote only" },
  { value: "hybrid", label: "Hybrid OK" },
  { value: "on_site", label: "On-site OK" },
  { value: "flexible", label: "Flexible" },
] as const;

export const WORK_AUTHORIZATION_OPTIONS = [
  { value: "canadian_citizen", label: "Canadian citizen" },
  { value: "permanent_resident", label: "Canadian permanent resident" },
  { value: "open_work_permit", label: "Open work permit (Canada)" },
  { value: "employer_sponsored", label: "Employer-sponsored (Canada)" },
  { value: "us_authorized", label: "US work authorized" },
  { value: "requires_sponsorship", label: "Requires sponsorship" },
] as const;

export const PRIMARY_LOCATION_OPTIONS = [
  { value: "Canada", label: "Canada" },
  { value: "United States", label: "United States" },
  { value: "Remote - Canada", label: "Remote - Canada" },
  { value: "Remote - North America", label: "Remote - North America" },
  { value: "Other", label: "Other" },
] as const;

export const PREFERRED_LOCATION_OPTIONS = [
  "Canada",
  "Remote",
  "United States",
  "Toronto, ON",
  "Vancouver, BC",
  "Montreal, QC",
  "Calgary, AB",
] as const;

export const TARGET_TITLE_OPTIONS = [
  "Frontend Engineer",
  "Senior Frontend Engineer",
  "Software Engineer",
  "Full Stack Engineer",
  "Staff Frontend Engineer",
  "Front End Developer",
] as const;

export type Seniority = (typeof SENIORITY_OPTIONS)[number]["value"];
export type RemotePreference = (typeof REMOTE_PREFERENCE_OPTIONS)[number]["value"];
export type WorkAuthorization = (typeof WORK_AUTHORIZATION_OPTIONS)[number]["value"];

export function labelForOption(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined
): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Map legacy free-text profile values to constrained option values */
export function normalizeWorkAuthorization(value: string | null | undefined): string {
  if (!value) return "";
  if (WORK_AUTHORIZATION_OPTIONS.some((o) => o.value === value)) return value;
  const lower = value.toLowerCase();
  if (lower.includes("citizen")) return "canadian_citizen";
  if (lower.includes("permanent resident")) return "permanent_resident";
  if (lower.includes("open work")) return "open_work_permit";
  if (lower.includes("sponsor")) return "requires_sponsorship";
  if (lower.includes("us") && lower.includes("authorized")) return "us_authorized";
  return "";
}

export function normalizeSeniority(value: string | null | undefined): string {
  if (!value) return "";
  if (SENIORITY_OPTIONS.some((o) => o.value === value)) return value;
  const lower = value.toLowerCase();
  if (lower.includes("staff") || lower.includes("principal")) return "staff";
  if (lower.includes("senior")) return "senior";
  if (lower.includes("lead")) return "lead";
  if (lower.includes("mid")) return "mid";
  if (lower.includes("junior")) return "junior";
  return "";
}

export function normalizeRemotePreference(value: string | null | undefined): string {
  if (!value) return "";
  if (REMOTE_PREFERENCE_OPTIONS.some((o) => o.value === value)) return value;
  const lower = value.toLowerCase();
  if (lower.includes("remote")) return "remote";
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("on-site") || lower.includes("onsite")) return "on_site";
  return "";
}
