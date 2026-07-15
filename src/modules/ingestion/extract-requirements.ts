const TECH_KEYWORDS = [
  "react", "typescript", "javascript", "next.js", "nextjs", "node.js", "nodejs",
  "graphql", "apollo", "tailwind", "playwright", "vitest", "redux", "zustand",
  "vue", "angular", "java", "kubernetes", "k8s", "aws", "docker", "python",
  "go", "rust", "c#", ".net", "spring", "postgresql", "mongodb", "firebase",
  "accessibility", "wcag", "figma", "mui", "shadcn",
];

const SKILL_SYNONYMS: Record<string, string[]> = {
  react: ["react.js", "reactjs"],
  typescript: ["ts"],
  javascript: ["js", "ecmascript"],
  "next.js": ["nextjs", "next"],
  "node.js": ["nodejs", "node"],
  playwright: ["e2e testing", "end-to-end testing"],
  kubernetes: ["k8s"],
  accessibility: ["a11y", "wcag"],
};

type Section = "none" | "required" | "preferred" | "responsibilities" | "bonus";

export type ExtractionQuality = {
  requirementCount: number;
  skillCount: number;
  confidence: "low" | "medium" | "high";
};

export function normalizeSkill(skill: string): string {
  const lower = skill.toLowerCase().trim();
  for (const [canonical, synonyms] of Object.entries(SKILL_SYNONYMS)) {
    if (lower === canonical || synonyms.includes(lower)) return canonical;
  }
  return lower;
}

export function extractTechnologies(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const tech of TECH_KEYWORDS) {
    if (lower.includes(tech)) {
      found.add(normalizeSkill(tech));
    }
  }
  return Array.from(found);
}

function detectSection(line: string): Section | null {
  const lower = line.toLowerCase().trim();
  if (line.length > 80) return null;

  if (
    /^(required|must have|minimum qualifications|qualifications|what you.?ll need|you have:?)$/i.test(
      lower
    ) ||
    (/required|must have|minimum qualifications|you have/i.test(lower) && line.length < 60)
  ) {
    return "required";
  }
  if (
    /^(preferred|nice to have|nice-to-have|bonus|plus:?)$/i.test(lower) ||
    (/preferred|nice to have|bonus/i.test(lower) && line.length < 60)
  ) {
    return "preferred";
  }
  if (
    /^(responsibilities|what you.?ll do|you.?ll do|what we.?re looking for you to do|your role)$/i.test(
      lower
    ) ||
    (/responsibilit/i.test(lower) && line.length < 60)
  ) {
    return "responsibilities";
  }
  if (/^bonus/i.test(lower) && line.length < 40) {
    return "bonus";
  }
  return null;
}

function classifySpecialRequirement(text: string): {
  type: "experience" | "location" | "authorization" | "clearance" | "language" | "education" | null;
  isHard: boolean;
} {
  const lower = text.toLowerCase();
  if (/\d+\+?\s*years?/i.test(text) || /experience with/i.test(lower)) {
    return { type: "experience", isHard: /must|required|minimum/i.test(lower) };
  }
  if (/authorized to work|work authorization|eligible to work|visa/i.test(lower)) {
    return { type: "authorization", isHard: true };
  }
  if (/security clearance|clearance required/i.test(lower)) {
    return { type: "clearance", isHard: true };
  }
  if (/\b(english|french|spanish|mandarin|bilingual)\b/i.test(lower) && /fluent|speak|language/i.test(lower)) {
    return { type: "language", isHard: /required|must/i.test(lower) };
  }
  if (/bachelor|master|phd|degree|diploma|education/i.test(lower)) {
    return { type: "education", isHard: /required|must/i.test(lower) };
  }
  if (/located in|must be in|on.?site in|based in|remote in/i.test(lower)) {
    return { type: "location", isHard: /must|required/i.test(lower) };
  }
  return { type: null, isHard: false };
}

export function extractRequirementsFromText(text: string): {
  required: string[];
  preferred: string[];
  responsibilities: string[];
  technologies: string[];
} {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const required: string[] = [];
  const preferred: string[] = [];
  const responsibilities: string[] = [];

  let section: Section = "none";

  for (const line of lines) {
    const detected = detectSection(line);
    if (detected) {
      section = detected === "bonus" ? "preferred" : detected;
      continue;
    }

    const bullet = line.replace(/^[-•*]\s*/, "").trim();
    if (bullet.length < 10) continue;

    if (section === "required") required.push(bullet);
    else if (section === "preferred") preferred.push(bullet);
    else if (section === "responsibilities") responsibilities.push(bullet);
    else if (/^\d+\+?\s*years?/i.test(bullet) || /experience with/i.test(bullet)) {
      required.push(bullet);
    }
  }

  if (required.length === 0) {
    const expMatches = text.match(/(\d+\+?\s*years?[^.\n]+)/gi);
    if (expMatches) required.push(...expMatches.slice(0, 5));
  }

  return {
    required,
    preferred,
    responsibilities,
    technologies: extractTechnologies(text),
  };
}

export function computeExtractionQuality(
  requirements: Array<{ requirementType: string; normalizedSkill?: string | null }>
): ExtractionQuality {
  const skillCount = requirements.filter(
    (r) => r.requirementType === "skill" || r.normalizedSkill
  ).length;
  const requirementCount = requirements.length;

  let confidence: ExtractionQuality["confidence"] = "high";
  if (requirementCount < 3 || skillCount < 1) confidence = "low";
  else if (requirementCount < 6 || skillCount < 2) confidence = "medium";

  return { requirementCount, skillCount, confidence };
}

export function requirementsToStructured(
  job: {
    requiredQualifications?: string[];
    preferredQualifications?: string[];
    responsibilities?: string[];
    technologies?: string[];
    location?: string | null;
    description?: string | null;
    experienceRequirements?: string | null;
    educationRequirements?: string | null;
  }
) {
  const requirements: Array<{
    requirementType:
      | "skill"
      | "experience"
      | "location"
      | "authorization"
      | "seniority"
      | "responsibility"
      | "domain"
      | "education"
      | "language"
      | "clearance";
    text: string;
    normalizedSkill?: string;
    importance: "required" | "preferred";
    isHardRequirement: boolean;
  }> = [];

  function addRequirement(
    text: string,
    importance: "required" | "preferred",
    defaultType: typeof requirements[0]["requirementType"] = "domain"
  ) {
    const special = classifySpecialRequirement(text);
    const techs = extractTechnologies(text);
    let requirementType = special.type ?? defaultType;
    if (!special.type && techs.length > 0) requirementType = "skill";
    else if (!special.type && /years/i.test(text)) requirementType = "experience";

    requirements.push({
      requirementType,
      text,
      normalizedSkill: techs[0],
      importance,
      isHardRequirement:
        special.isHard || (importance === "required" && /must|required|mandatory/i.test(text)),
    });
  }

  for (const text of job.requiredQualifications ?? []) {
    addRequirement(text, "required");
  }

  for (const text of job.preferredQualifications ?? []) {
    addRequirement(text, "preferred");
  }

  for (const text of job.responsibilities ?? []) {
    addRequirement(text, "required", "responsibility");
  }

  for (const tech of job.technologies ?? []) {
    if (!requirements.some((r) => r.normalizedSkill === normalizeSkill(tech))) {
      requirements.push({
        requirementType: "skill",
        text: `Experience with ${tech}`,
        normalizedSkill: normalizeSkill(tech),
        importance: "required",
        isHardRequirement: false,
      });
    }
  }

  if (job.experienceRequirements) {
    addRequirement(job.experienceRequirements, "required", "experience");
  }

  if (job.educationRequirements) {
    addRequirement(job.educationRequirements, "required", "education");
  }

  if (job.location) {
    requirements.push({
      requirementType: "location",
      text: job.location,
      importance: "required",
      isHardRequirement: /must be located|on.?site only/i.test(
        job.location + (job.description ?? "")
      ),
    });
  }

  const fullText = job.description ?? "";
  const authMatch = fullText.match(
    /(?:authorized to work|work authorization|eligible to work)[^..\n]{0,120}/i
  );
  if (authMatch && !requirements.some((r) => r.requirementType === "authorization")) {
    requirements.push({
      requirementType: "authorization",
      text: authMatch[0].trim(),
      importance: "required",
      isHardRequirement: true,
    });
  }

  return requirements;
}
