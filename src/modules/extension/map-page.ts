import { chooseOption, splitLegalName } from "@/modules/apply/map-questions";
import { normalizeQuestionLabel } from "@/modules/apply/questions";
import type { ApplicationProfile } from "@/modules/apply/types";
import type {
  AttentionItem,
  ExtensionDocuments,
  FillInstruction,
  PageField,
  PageFillPlan,
  PreparedFillAnswer,
} from "@/modules/extension/page-types";
import {
  isFinalReviewStep,
  isNavigationControl,
  type PageProvider,
} from "@/modules/extension/urls";

const DEFAULT_EEO = "prefer not to say";

type FieldKind =
  | "firstName"
  | "lastName"
  | "legalName"
  | "email"
  | "phone"
  | "city"
  | "province"
  | "location"
  | "linkedin"
  | "github"
  | "portfolio"
  | "workAuthorization"
  | "sponsorship"
  | "relocate"
  | "startDate"
  | "salary"
  | "pronouns"
  | "howDidYouHear"
  | "eeoGender"
  | "eeoRace"
  | "eeoVeteran"
  | "eeoDisability"
  | "coverLetter"
  | "resume"
  | "openEnded"
  | "consent"
  | "unmapped";

function signalText(value: string): string {
  return normalizeQuestionLabel(value.replace(/([a-z])([A-Z])/g, "$1 $2"));
}

function blocksName(label: string): boolean {
  return /\b(company|user|manager|referr|file|project|team)\b/.test(label);
}

function classifyText(label: string): FieldKind {
  if (!label) return "unmapped";
  if (/\b(agree|consent|terms of|privacy policy|acknowledge|certify)\b/.test(label)) return "consent";
  if (/\bemail\b/.test(label)) return "email";
  if (/\b(phone|mobile|telephone)\b/.test(label)) return "phone";
  if (/\blinkedin\b|\blinked in\b/.test(label)) return "linkedin";
  if (/\bgithub\b|\bgit hub\b/.test(label)) return "github";
  if (/\b(portfolio|personal site|personal website)\b/.test(label)) return "portfolio";
  if (/\b(website|url)\b/.test(label) && !/\bcompany\b/.test(label)) return "portfolio";
  if (!blocksName(label) && /\b(first name|given name|firstname|givenname)\b/.test(label)) return "firstName";
  if (!blocksName(label) && /\b(last name|surname|family name|lastname|familyname)\b/.test(label)) return "lastName";
  if (
    !blocksName(label) &&
    (/\b(legal name|full name|your name)\b/.test(label) || label === "name" || label === "candidate name")
  ) {
    return "legalName";
  }
  if (/\bpronouns?\b/.test(label)) return "pronouns";
  if (/\bcity\b/.test(label) && /\b(province|state)\b/.test(label)) return "location";
  if (/\bcity\b/.test(label)) return "city";
  if (/\b(province|state|region)\b/.test(label)) return "province";
  if (/\b(location|current location|address)\b/.test(label) || /where (are|do) you (live|based)/.test(label)) {
    return "location";
  }
  const sponsorship = /\bsponsor|\bvisa\b/.test(label);
  const authorization = /authoriz|authoris|eligible to work|right to work|\bcitizen|work permit|legally entitled/.test(label);
  if (sponsorship && !authorization) return "sponsorship";
  if (authorization) return "workAuthorization";
  if (sponsorship) return "sponsorship";
  if (/\brelocat/.test(label)) return "relocate";
  if (/\b(start date|earliest start|date available|available to start)\b/.test(label)) return "startDate";
  if (/\b(salary|compensation|expected pay|desired pay|pay expectation)\b/.test(label)) return "salary";
  if (/how did you hear|where did you hear|how did you find|referral source/.test(label)) return "howDidYouHear";
  if (/\b(gender|sex)\b/.test(label)) return "eeoGender";
  if (/\b(race|ethnicity)\b/.test(label)) return "eeoRace";
  if (/\bveteran\b/.test(label)) return "eeoVeteran";
  if (/\bdisabilit/.test(label)) return "eeoDisability";
  if (/\bvoluntary\b/.test(label) || /\bself identify\b/.test(label) || /\bequal opportunity\b/.test(label)) {
    return "eeoGender";
  }
  if (/\bcover letter\b/.test(label)) return "coverLetter";
  if (/\b(resume|cv)\b/.test(label)) return "resume";
  if (/\b(why|tell us|describe|walk us|interested|about yourself|motivation|strength|weakness)\b/.test(label)) {
    return "openEnded";
  }
  return "unmapped";
}

function classify(field: PageField): FieldKind {
  const label = signalText(field.label);
  const technical = signalText(`${field.name} ${field.id}`);
  const combined = `${label} ${technical}`.trim();
  if (field.type === "file") {
    if (/\b(cover letter|coverletter)\b/.test(combined)) return "coverLetter";
    if (/\b(resume|cv)\b/.test(combined)) return "resume";
    return "unmapped";
  }
  if (field.type === "email") return "email";
  if (field.type === "tel" || field.type === "phone") return "phone";
  const fromLabel = classifyText(label);
  if (fromLabel !== "unmapped") return fromLabel;
  const fromName = classifyText(technical);
  if (fromName !== "unmapped") return fromName;
  if (field.tag === "textarea" || field.type === "textarea") return "openEnded";
  return "unmapped";
}

function isEeo(kind: FieldKind): boolean {
  return kind === "eeoGender" || kind === "eeoRace" || kind === "eeoVeteran" || kind === "eeoDisability";
}

function explicitEeo(value: string): string {
  const norm = normalizeQuestionLabel(value);
  if (!norm || norm === DEFAULT_EEO || /prefer not|decline to self/.test(norm)) return "";
  return value.trim();
}

function textMatch(label: string, answers: PreparedFillAnswer[]): string | null {
  const wanted = normalizeQuestionLabel(label);
  if (!wanted) return null;
  let best: { score: number; answer: string } | null = null;
  for (const item of answers) {
    const saved = normalizeQuestionLabel(item.label);
    const answer = item.answer.trim();
    if (!saved || !answer) continue;
    let score = 0;
    if (saved === wanted) score = 100;
    else if (wanted.length >= 12 && saved.length >= 12 && (wanted.includes(saved) || saved.includes(wanted))) {
      score = 80;
    } else {
      const left = new Set(wanted.split(" ").filter((word) => word.length > 2));
      const right = new Set(saved.split(" ").filter((word) => word.length > 2));
      if (left.size >= 3 && right.size >= 3) {
        let overlap = 0;
        for (const word of left) if (right.has(word)) overlap += 1;
        const union = left.size + right.size - overlap;
        if (union > 0 && overlap / union >= 0.6) score = Math.round((overlap / union) * 70);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { score, answer };
  }
  return best?.answer ?? null;
}

function yesNoOptions(field: PageField): boolean {
  if (field.options.length < 2 || field.options.length > 4) return false;
  return field.options.every((option) => {
    const norm = normalizeQuestionLabel(option.text);
    return norm === "yes" || norm === "no";
  });
}

function profileValue(kind: FieldKind, profile: ApplicationProfile, field: PageField): string {
  const location = [profile.city, profile.province].filter(Boolean).join(", ");
  switch (kind) {
    case "firstName":
      return splitLegalName(profile.legalName).first;
    case "lastName":
      return splitLegalName(profile.legalName).last;
    case "legalName":
      return profile.legalName;
    case "email":
      return profile.email;
    case "phone":
      return profile.phone;
    case "city":
      return profile.city;
    case "province":
      return profile.province;
    case "location":
      return location;
    case "linkedin":
      return profile.linkedinUrl;
    case "github":
      return profile.githubUrl;
    case "portfolio":
      return profile.portfolioUrl;
    case "workAuthorization": {
      if (yesNoOptions(field)) {
        const text = profile.workAuthorization.toLowerCase();
        if (!text.trim() || (text.includes("require") && text.includes("sponsor"))) return "No";
        return "Yes";
      }
      return profile.workAuthorization;
    }
    case "sponsorship":
      return profile.requiresSponsorship ? "Yes" : "No";
    case "relocate":
      return profile.willingToRelocate ? "Yes" : "No";
    case "startDate":
      return profile.earliestStartDate;
    case "salary":
      if (profile.salaryExpectationCad == null) return "";
      return field.type === "number" ? String(profile.salaryExpectationCad) : `${profile.salaryExpectationCad} CAD`;
    case "pronouns":
      return profile.pronouns;
    case "howDidYouHear":
      return profile.howDidYouHear;
    case "eeoGender":
      return explicitEeo(profile.eeoGender);
    case "eeoRace":
      return explicitEeo(profile.eeoRace);
    case "eeoVeteran":
      return explicitEeo(profile.eeoVeteran);
    case "eeoDisability":
      return explicitEeo(profile.eeoDisability);
    case "coverLetter":
      return "";
    default:
      return "";
  }
}

function choiceValue(field: PageField, desired: string): string | null {
  const texts = field.options.map((option) => option.text);
  const picked = chooseOption(texts, desired);
  if (!picked) return null;
  return field.options.find((option) => option.text === picked)?.value ?? null;
}

function shapeValue(field: PageField, desired: string): string | null {
  let value = desired.trim();
  if (!value) return null;
  if (field.tag === "select" || field.type === "radio" || field.type === "checkbox") {
    return choiceValue(field, value);
  }
  if (field.type === "number") value = value.replace(/[^0-9.]/g, "");
  if (field.type === "date") {
    const match = value.match(/\d{4}-\d{2}-\d{2}/);
    value = match?.[0] ?? "";
  }
  value = value.slice(0, 8000);
  return value || null;
}

function attention(field: PageField, reason: string): AttentionItem {
  return { key: field.key, label: field.label || field.name || field.key, reason };
}

export function planPageFill(input: {
  provider: PageProvider;
  headings: string[];
  buttons: string[];
  fields: PageField[];
  profile: ApplicationProfile;
  preparedAnswers: PreparedFillAnswer[];
  documents: ExtensionDocuments;
}): PageFillPlan {
  const ignoredControls = input.buttons.filter(isNavigationControl);
  const reviewStep = isFinalReviewStep(input.headings);
  if (reviewStep) {
    return {
      provider: input.provider,
      reviewStep: true,
      reviewNote:
        "This is the final review step. Check the application yourself. The extension will not continue or submit.",
      fills: [],
      attention: [],
      ignoredControls,
    };
  }

  const fills: FillInstruction[] = [];
  const needs: AttentionItem[] = [];
  let resumePlanned = false;
  let coverPlanned = false;
  const saved = input.profile.savedAnswers.map((item) => ({ label: item.question, answer: item.answer }));

  for (const field of input.fields) {
    if (field.currentValue.trim()) continue;
    const kind = classify(field);
    if (kind === "consent") {
      if (field.required) needs.push(attention(field, "Confirm this yourself before you submit."));
      continue;
    }
    if (kind === "resume" && field.type === "file") {
      if (input.documents.resume && !resumePlanned) {
        fills.push({
          key: field.key,
          name: field.name,
          label: field.label || "Resume",
          value: "",
          mode: "file",
          fileRole: "resume",
        });
        resumePlanned = true;
      } else if (field.required) {
        needs.push(attention(field, "No resume is available to attach."));
      }
      continue;
    }
    if (kind === "coverLetter" && field.type === "file") {
      if (input.documents.coverLetter && !coverPlanned) {
        fills.push({
          key: field.key,
          name: field.name,
          label: field.label || "Cover letter",
          value: "",
          mode: "file",
          fileRole: "coverLetter",
        });
        coverPlanned = true;
      } else if (field.required) {
        needs.push(attention(field, "No cover letter is saved for this job."));
      }
      continue;
    }
    if (field.type === "file") {
      if (field.required) needs.push(attention(field, "Attach this file yourself."));
      continue;
    }

    const prepared = textMatch(field.label, input.preparedAnswers);
    const remembered = textMatch(field.label, saved);
    let desired = "";
    if (prepared) desired = prepared;
    else if (remembered && (kind === "openEnded" || kind === "unmapped" || isEeo(kind))) desired = remembered;
    else if (kind === "coverLetter") desired = input.documents.coverLetterBody?.trim() ?? remembered ?? "";
    else if (isEeo(kind)) desired = remembered || profileValue(kind, input.profile, field);
    else if (kind === "openEnded" || kind === "unmapped") desired = "";
    else desired = profileValue(kind, input.profile, field);

    const value = shapeValue(field, desired);
    if (!value) {
      if (field.required) {
        const reason = isEeo(kind)
          ? "Voluntary question left blank. Add a saved answer if you want it filled."
          : kind === "openEnded"
            ? "No prepared answer for this question. Nothing new was generated."
            : "Required field was not filled.";
        needs.push(attention(field, reason));
      }
      continue;
    }

    fills.push({
      key: field.key,
      name: field.name,
      label: field.label || field.name || field.key,
      value,
      mode: field.tag === "select" ? "select" : field.type === "radio" || field.type === "checkbox" ? "choice" : "value",
    });
  }

  return {
    provider: input.provider,
    reviewStep: false,
    reviewNote: null,
    fills,
    attention: needs,
    ignoredControls,
  };
}
