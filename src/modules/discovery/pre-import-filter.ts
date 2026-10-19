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

function normalizeDiscoveryTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/.,]+/g, " ")
    .replace(/\bfront\s+end\b/g, "frontend")
    .replace(/\bfull\s+stack\b/g, "fullstack")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value: string): Set<string> {
  const tokens = new Set(normalizeDiscoveryTitle(value).split(" ").filter(Boolean));
  if (tokens.has("engineer")) tokens.add("developer");
  if (tokens.has("developer")) tokens.add("engineer");
  return tokens;
}

export function matchesDiscoveredJobTitle(title: string, profile?: CandidateProfile): boolean {
  const lower = title.toLowerCase();
  if (BLOCKED_TITLE_PATTERNS.some((p) => p.test(lower))) return false;

  if (profile?.targetTitles?.length) {
    const tokens = titleTokens(title);
    return profile.targetTitles.some((target) => {
      const needed = normalizeDiscoveryTitle(target).split(" ").filter(Boolean);
      return needed.length > 0 && needed.every((token) => tokens.has(token));
    });
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
  if (!matchesDiscoveredJobTitle(job.title, profile)) {
    return { import: false, reason: "title_mismatch" };
  }

  const eligibility = classifyLocationEligibility(job, { gtaCities });
  if (!isLocationVisible(eligibility.class, visibility)) {
    return { import: false, reason: "location_mismatch" };
  }
  return { import: true };
}
