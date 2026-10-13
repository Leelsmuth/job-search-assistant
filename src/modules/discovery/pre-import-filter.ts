import type { NormalizedJob } from "@/modules/ingestion/types";
import type { CandidateProfile } from "@/modules/matching/engine";
import {
  classifyLocationEligibility,
  isLocationVisible,
  type LocationVisibility,
} from "@/modules/location/eligibility";

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

function titleMatchesProfile(title: string, profile?: CandidateProfile): boolean {
  const lower = title.toLowerCase();
  if (BLOCKED_TITLE_PATTERNS.some((p) => p.test(lower))) return false;

  if (profile?.targetTitles?.length) {
    return profile.targetTitles.some((t) => lower.includes(t.toLowerCase()));
  }

  return ALLOWED_TITLE_PATTERNS.some((p) => p.test(lower));
}

const DEFAULT_VISIBILITY: LocationVisibility = {
  includeHybridGta: true,
  includeOnsiteGta: true,
  showRemoteOther: false,
  showOutOfArea: false,
};

export function shouldImportDiscoveredJob(
  job: NormalizedJob,
  profile?: CandidateProfile,
  visibility: LocationVisibility = DEFAULT_VISIBILITY,
  gtaCities?: string[]
): { import: boolean; reason?: string } {
  if (!titleMatchesProfile(job.title, profile)) {
    return { import: false, reason: "title_mismatch" };
  }

  const eligibility = classifyLocationEligibility(job, { gtaCities });
  if (!isLocationVisible(eligibility.class, visibility)) {
    return { import: false, reason: "location_mismatch" };
  }
  return { import: true };
}
