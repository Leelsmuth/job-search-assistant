import { normalizeSkill } from "@/modules/ingestion/extract-requirements";
import type { MatchClassification } from "@/lib/utils";

export type CandidateProfile = {
  location?: string | null;
  workAuthorization?: string | null;
  targetTitles?: string[];
  preferredSeniority?: string | null;
  remotePreference?: string | null;
  preferredLocations?: string[];
  yearsExperience?: number | null;
  skills: Array<{ name: string; category: string; proficiency?: string | null; yearsExperience?: number | null }>;
  evidence: Array<{ id: string; evidenceText: string; normalizedSkills: string[] }>;
};

export type JobForMatching = {
  title: string;
  location?: string | null;
  workplaceType?: string | null;
  description?: string | null;
  requirements: Array<{
    id: string;
    requirementType: string;
    text: string;
    normalizedSkill?: string | null;
    importance: string;
    isHardRequirement: boolean;
  }>;
};

export type HardFilterResult = {
  result: "pass" | "warning" | "block";
  warnings: string[];
  blocks: string[];
};

export type CategoryScore = {
  category: string;
  score: number;
  maxScore: number;
  explanation: string;
};

export type RequirementMatchResult = {
  jobRequirementId: string;
  matchStatus: "confirmed" | "transferable" | "missing_evidence" | "gap" | "blocked";
  confidence: number;
  evidenceId?: string;
  explanation: string;
};

export const CATEGORY_WEIGHTS: Record<string, number> = {
  core_skills: 25,
  frameworks_tools: 15,
  relevant_experience: 20,
  responsibility_alignment: 15,
  seniority_leadership: 10,
  location_work_arrangement: 10,
  education_domain: 5,
};

const CORE_SKILLS = new Set(["react", "typescript", "javascript"]);
const FRAMEWORK_SKILLS = new Set([
  "next.js", "tailwind", "graphql", "redux", "zustand", "mui", "shadcn",
  "apollo", "tanstack query", "node.js", "firebase",
]);

const TRANSFERABLE_MAP: Record<string, string[]> = {
  vue: ["react", "javascript"],
  angular: ["react", "typescript"],
  cypress: ["playwright"],
};

export function applyHardFilters(
  profile: CandidateProfile,
  job: JobForMatching
): HardFilterResult {
  const warnings: string[] = [];
  const blocks: string[] = [];

  const jobText = `${job.title} ${job.location ?? ""} ${job.description ?? ""}`.toLowerCase();
  const prefRemote = profile.remotePreference === "remote";
  const jobOnSite = job.workplaceType === "on_site";
  const jobLocation = (job.location ?? "").toLowerCase();

  if (prefRemote && jobOnSite) {
    blocks.push("Role is on-site but you prefer remote work");
  }

  if (jobLocation.includes("san francisco") || jobLocation.includes("new york")) {
    if (!profile.preferredLocations?.some((l) => jobLocation.includes(l.toLowerCase()))) {
      if (job.workplaceType !== "remote") {
        blocks.push(`Role requires location in ${job.location}`);
      }
    }
  }

  if (jobLocation.includes("canada") || jobText.includes("canada")) {
    // passes Canada filter
  } else if (jobOnSite && !jobText.includes("remote")) {
    warnings.push("Role may not be Canada-based or remote");
  }

  const yearsReq = job.requirements.find(
    (r) => r.requirementType === "experience" && /\d+\+?\s*years?/i.test(r.text)
  );
  if (yearsReq) {
    const match = yearsReq.text.match(/(\d+)\+?\s*years?/i);
    const requiredYears = match ? parseInt(match[1], 10) : 0;
    const candidateYears = profile.yearsExperience ?? 0;
    if (requiredYears > candidateYears + 3) {
      warnings.push(`Role requires ${requiredYears}+ years; profile shows ${candidateYears}`);
    }
  }

  const titleLower = job.title.toLowerCase();
  const isStaff = titleLower.includes("staff") || titleLower.includes("principal");
  if (isStaff && (profile.yearsExperience ?? 0) < 8) {
    warnings.push("Staff/principal level may exceed current seniority");
  }

  const clearanceReq = job.requirements.find((r) => r.requirementType === "clearance");
  if (clearanceReq) {
    blocks.push(`Requires security clearance: ${clearanceReq.text}`);
  }

  let result: HardFilterResult["result"] = "pass";
  if (blocks.length > 0) result = "block";
  else if (warnings.length > 0) result = "warning";

  return { result, warnings, blocks };
}

export function getCandidateSkillSet(profile: CandidateProfile): Set<string> {
  const skills = new Set<string>();
  for (const s of profile.skills) {
    skills.add(normalizeSkill(s.name));
  }
  for (const e of profile.evidence) {
    for (const s of e.normalizedSkills) {
      skills.add(normalizeSkill(s));
    }
  }
  return skills;
}

export function mapRequirementToEvidence(
  requirement: JobForMatching["requirements"][0],
  profile: CandidateProfile,
  candidateSkills: Set<string>
): RequirementMatchResult {
  const skill = requirement.normalizedSkill
    ? normalizeSkill(requirement.normalizedSkill)
    : null;

  if (requirement.requirementType === "location" && requirement.isHardRequirement) {
    return {
      jobRequirementId: requirement.id,
      matchStatus: "blocked",
      confidence: 0.9,
      explanation: `Location requirement: ${requirement.text}`,
    };
  }

  if (!skill) {
    if (requirement.requirementType === "responsibility") {
      const match = profile.evidence.find((e) =>
        requirement.text.split(" ").some(
          (word) => word.length > 4 && e.evidenceText.toLowerCase().includes(word.toLowerCase())
        )
      );
      if (match) {
        return {
          jobRequirementId: requirement.id,
          matchStatus: "confirmed",
          confidence: 0.7,
          evidenceId: match.id,
          explanation: `Responsibility aligned with: "${match.evidenceText.slice(0, 80)}..."`,
        };
      }
    }
    return {
      jobRequirementId: requirement.id,
      matchStatus: "missing_evidence",
      confidence: 0.5,
      explanation: "No specific skill mapping for this requirement",
    };
  }

  if (candidateSkills.has(skill)) {
    const evidence = profile.evidence.find((e) =>
      e.normalizedSkills.some((s) => normalizeSkill(s) === skill)
    );
    return {
      jobRequirementId: requirement.id,
      matchStatus: "confirmed",
      confidence: 0.9,
      evidenceId: evidence?.id,
      explanation: evidence
        ? `Confirmed: "${evidence.evidenceText.slice(0, 100)}"`
        : `Skill ${skill} found in profile`,
    };
  }

  const transferableFrom = Object.entries(TRANSFERABLE_MAP).find(([req]) => req === skill);
  if (transferableFrom) {
    const hasTransferable = transferableFrom[1].some((t) => candidateSkills.has(t));
    if (hasTransferable) {
      return {
        jobRequirementId: requirement.id,
        matchStatus: "transferable",
        confidence: 0.6,
        explanation: `${skill} not direct but related skills present (${transferableFrom[1].join(", ")})`,
      };
    }
  }

  const hasRelated = Array.from(candidateSkills).some(
    (s) => skill.includes(s) || s.includes(skill)
  );
  if (hasRelated) {
    return {
      jobRequirementId: requirement.id,
      matchStatus: "transferable",
      confidence: 0.5,
      explanation: `Partial overlap with related skills for ${skill}`,
    };
  }

  const isCoreGap = ["java", "kubernetes", "k8s", "aws", "vue", "go", "rust", "c#"].includes(skill);
  return {
    jobRequirementId: requirement.id,
    matchStatus: isCoreGap ? "gap" : "missing_evidence",
    confidence: 0.8,
    explanation: isCoreGap
      ? `No evidence of ${skill} in profile — qualification gap`
      : `${skill} not documented in profile — may exist but not evidenced`,
  };
}

export function scoreCategories(
  profile: CandidateProfile,
  job: JobForMatching,
  requirementMatches: RequirementMatchResult[]
): CategoryScore[] {
  const candidateSkills = getCandidateSkillSet(profile);
  const jobSkills = job.requirements
    .filter((r) => r.normalizedSkill)
    .map((r) => normalizeSkill(r.normalizedSkill!));

  const coreJobSkills = jobSkills.filter((s) => CORE_SKILLS.has(s));
  const frameworkJobSkills = jobSkills.filter((s) => FRAMEWORK_SKILLS.has(s));

  const coreMatched = coreJobSkills.filter((s) => candidateSkills.has(s)).length;
  const coreScore = coreJobSkills.length
    ? (coreMatched / coreJobSkills.length) * CATEGORY_WEIGHTS.core_skills
    : 0;

  const fwMatched = frameworkJobSkills.filter((s) => candidateSkills.has(s)).length;
  const fwScore = frameworkJobSkills.length
    ? (fwMatched / frameworkJobSkills.length) * CATEGORY_WEIGHTS.frameworks_tools
    : 0;

  const confirmedCount = requirementMatches.filter((m) => m.matchStatus === "confirmed").length;
  const totalReqs = requirementMatches.length || 1;
  const expScore = (confirmedCount / totalReqs) * CATEGORY_WEIGHTS.relevant_experience;

  const respReqs = job.requirements.filter((r) => r.requirementType === "responsibility");
  const respMatched = requirementMatches.filter(
    (m) => m.matchStatus === "confirmed" &&
      respReqs.some((r) => r.id === m.jobRequirementId)
  ).length;
  const respScore = respReqs.length
    ? (respMatched / respReqs.length) * CATEGORY_WEIGHTS.responsibility_alignment
    : 0;

  const titleLower = job.title.toLowerCase();
  const wantsSenior = titleLower.includes("senior") || titleLower.includes("staff");
  const seniorityScore = wantsSenior
    ? (profile.yearsExperience ?? 0) >= 5
      ? CATEGORY_WEIGHTS.seniority_leadership
      : CATEGORY_WEIGHTS.seniority_leadership * 0.5
    : CATEGORY_WEIGHTS.seniority_leadership * 0.8;

  const remotePref = profile.remotePreference === "remote";
  const jobRemote = job.workplaceType === "remote";
  const locScore =
    remotePref && jobRemote
      ? CATEGORY_WEIGHTS.location_work_arrangement
      : job.workplaceType === "hybrid"
        ? CATEGORY_WEIGHTS.location_work_arrangement * 0.7
        : CATEGORY_WEIGHTS.location_work_arrangement * 0.4;

  const eduReqs = job.requirements.filter((r) => r.requirementType === "education");
  const hasEducationReqs =
    eduReqs.length > 0 || Boolean(job.description?.toLowerCase().includes("degree"));
  const eduScore = hasEducationReqs ? CATEGORY_WEIGHTS.education_domain * 0.8 : 0;
  const eduExplanation = hasEducationReqs
    ? "Education requirements assumed met"
    : "No education requirements detected";

  return [
    {
      category: "core_skills",
      score: Math.round(coreScore * 10) / 10,
      maxScore: CATEGORY_WEIGHTS.core_skills,
      explanation: `${coreMatched}/${coreJobSkills.length || "N/A"} core skills matched`,
    },
    {
      category: "frameworks_tools",
      score: Math.round(fwScore * 10) / 10,
      maxScore: CATEGORY_WEIGHTS.frameworks_tools,
      explanation: `${fwMatched}/${frameworkJobSkills.length || "N/A"} frameworks/tools matched`,
    },
    {
      category: "relevant_experience",
      score: Math.round(expScore * 10) / 10,
      maxScore: CATEGORY_WEIGHTS.relevant_experience,
      explanation: `${confirmedCount} confirmed requirement matches`,
    },
    {
      category: "responsibility_alignment",
      score: Math.round(respScore * 10) / 10,
      maxScore: CATEGORY_WEIGHTS.responsibility_alignment,
      explanation: `${respMatched}/${respReqs.length || "N/A"} responsibilities aligned`,
    },
    {
      category: "seniority_leadership",
      score: Math.round(seniorityScore * 10) / 10,
      maxScore: CATEGORY_WEIGHTS.seniority_leadership,
      explanation: wantsSenior ? "Seniority assessed against role level" : "Mid-level alignment",
    },
    {
      category: "location_work_arrangement",
      score: Math.round(locScore * 10) / 10,
      maxScore: CATEGORY_WEIGHTS.location_work_arrangement,
      explanation: `Remote preference vs ${job.workplaceType ?? "unknown"} role`,
    },
    {
      category: "education_domain",
      score: Math.round(eduScore * 10) / 10,
      maxScore: CATEGORY_WEIGHTS.education_domain,
      explanation: eduExplanation,
    },
  ];
}

export const EXTRACTION_QUALITY_MIN_REQUIREMENTS = 3;
export const EXTRACTION_QUALITY_MIN_SKILLS = 1;
export const SPARSE_EXTRACTION_SCORE_CAP = 70;

export function isSparseExtraction(requirements: JobForMatching["requirements"]): boolean {
  const skillCount = requirements.filter(
    (r) => r.requirementType === "skill" || r.normalizedSkill
  ).length;
  return (
    requirements.length < EXTRACTION_QUALITY_MIN_REQUIREMENTS ||
    skillCount < EXTRACTION_QUALITY_MIN_SKILLS
  );
}

export function classifyScore(
  overallScore: number,
  hardFilter: HardFilterResult
): MatchClassification {
  if (hardFilter.result === "block") return "poor";
  if (overallScore >= 85) return "excellent";
  if (overallScore >= 75) return "strong";
  if (overallScore >= 60) return "possible";
  if (overallScore >= 45) return "stretch";
  return "poor";
}

export function runMatchAnalysis(
  profile: CandidateProfile,
  job: JobForMatching
) {
  const hardFilter = applyHardFilters(profile, job);
  const candidateSkills = getCandidateSkillSet(profile);

  const requirementMatches = job.requirements.map((req) =>
    mapRequirementToEvidence(req, profile, candidateSkills)
  );

  const categoryScores = scoreCategories(profile, job, requirementMatches);
  let overallScore = Math.round(
    categoryScores.reduce((sum, c) => sum + c.score, 0)
  );

  const sparseExtraction = isSparseExtraction(job.requirements);
  if (sparseExtraction) {
    overallScore = Math.min(overallScore, SPARSE_EXTRACTION_SCORE_CAP);
  }

  const criticalGaps = requirementMatches.filter(
    (m) =>
      m.matchStatus === "gap" &&
      job.requirements.find((r) => r.id === m.jobRequirementId)?.importance === "required"
  );
  if (criticalGaps.length >= 2) {
    overallScore = Math.min(overallScore, 40);
  } else if (criticalGaps.length === 1) {
    overallScore = Math.min(overallScore, 55);
  }

  const classification = classifyScore(overallScore, hardFilter);

  const confirmed = requirementMatches.filter((m) => m.matchStatus === "confirmed");
  const gaps = requirementMatches.filter(
    (m) => m.matchStatus === "gap" || m.matchStatus === "blocked"
  );

  const topMatchingSkills = confirmed
    .map((m) => {
      const req = job.requirements.find((r) => r.id === m.jobRequirementId);
      return req?.normalizedSkill;
    })
    .filter(Boolean) as string[];

  const topConcern =
    gaps[0]?.explanation ??
    hardFilter.blocks[0] ??
    hardFilter.warnings[0] ??
    null;

  const strongMatches = confirmed.slice(0, 5).map((m) => m.explanation);
  const partialMatches = requirementMatches
    .filter((m) => m.matchStatus === "transferable")
    .map((m) => m.explanation);
  const gapList = requirementMatches
    .filter((m) => m.matchStatus === "gap" || m.matchStatus === "missing_evidence")
    .map((m) => m.explanation);

  const summary = [
    `Overall match: ${overallScore}% (${classification})`,
    sparseExtraction ? "Limited requirement extraction — score may be unreliable" : "",
    strongMatches.length ? `Strong: ${strongMatches.slice(0, 2).join("; ")}` : "",
    gapList.length ? `Gaps: ${gapList.slice(0, 2).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return {
    hardFilter,
    categoryScores,
    requirementMatches,
    overallScore,
    classification,
    topMatchingSkills: topMatchingSkills.slice(0, 5),
    topConcern,
    summary,
    strongMatches,
    partialMatches,
    gaps: gapList,
  };
}
