import type { NormalizedJob } from "@/modules/ingestion/types";
import type { CandidateProfile } from "@/modules/matching/engine";

const BLOCKED_TITLE_PATTERNS = [
  /\b(sales|account executive|business development|recruiter|talent acquisition)\b/i,
  /\b(customer success|support specialist|call center)\b/i,
  /\b(data scientist|machine learning engineer|research scientist)\b/i,
  /\b(intern\b|internship|co-op\b|new grad only)/i,
  /\b(warehouse|driver|nurse|physician|attorney|paralegal)\b/i,
];

const ALLOWED_TITLE_PATTERNS = [
  /\b(frontend|front-end|front end)\b/i,
  /\b(full[\s-]?stack|software|web|product|platform|mobile|ios|android)\b/i,
  /\b(staff|principal|senior|lead)\b.*\b(engineer|developer)\b/i,
  /\b(engineer|developer|programmer|architect)\b/i,
  /\b(ui|ux|design engineer)\b/i,
  /\b(react|typescript|javascript|node)\b/i,
];

const CANADA_LOCATION_PATTERNS = [
  /\bcanada\b/i,
  /\btoronto\b/i,
  /\bvancouver\b/i,
  /\bmontreal\b/i,
  /\bottawa\b/i,
  /\bcalgary\b/i,
  /\bremote\b.*\bcanada\b/i,
  /\bcanada\b.*\bremote\b/i,
];

function titleMatchesProfile(title: string, profile?: CandidateProfile): boolean {
  const lower = title.toLowerCase();
  if (BLOCKED_TITLE_PATTERNS.some((p) => p.test(lower))) return false;

  if (profile?.targetTitles?.length) {
    return profile.targetTitles.some((t) => lower.includes(t.toLowerCase()));
  }

  return ALLOWED_TITLE_PATTERNS.some((p) => p.test(lower));
}

function locationMatchesProfile(
  job: NormalizedJob,
  profile?: CandidateProfile
): boolean {
  const locationText = `${job.location ?? ""} ${job.description.slice(0, 500)}`.toLowerCase();
  const isRemote =
    job.workplaceType === "remote" || /\bremote\b/i.test(locationText);
  const isCanada = CANADA_LOCATION_PATTERNS.some((p) => p.test(locationText));

  if (profile?.remotePreference === "remote" && isRemote) return true;
  if (profile?.preferredLocations?.length) {
    const preferred = profile.preferredLocations.map((l) => l.toLowerCase());
    if (preferred.some((p) => locationText.includes(p))) return true;
  }
  if (profile?.location?.toLowerCase().includes("canada") && (isCanada || isRemote)) {
    return true;
  }

  if (isCanada || isRemote) return true;

  if (job.workplaceType === "hybrid" && isCanada) return true;

  return false;
}

export function shouldImportDiscoveredJob(
  job: NormalizedJob,
  profile?: CandidateProfile
): { import: boolean; reason?: string } {
  if (!titleMatchesProfile(job.title, profile)) {
    return { import: false, reason: "title_mismatch" };
  }
  if (!locationMatchesProfile(job, profile)) {
    return { import: false, reason: "location_mismatch" };
  }
  return { import: true };
}
