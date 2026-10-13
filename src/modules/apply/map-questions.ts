import type {
  ApplicationProfile,
  AnswerKind,
  ExistingAnswer,
  FormQuestion,
  MappedQuestion,
  ValueSource,
} from "./types";
import { normalizeQuestionLabel } from "./questions";

type ProfileField =
  | "firstName"
  | "lastName"
  | "legalName"
  | "email"
  | "phone"
  | "city"
  | "province"
  | "location"
  | "linkedinUrl"
  | "githubUrl"
  | "portfolioUrl"
  | "workAuthorization"
  | "requiresSponsorship"
  | "willingToRelocate"
  | "earliestStartDate"
  | "salaryExpectationCad"
  | "pronouns"
  | "howDidYouHear"
  | "eeoGender"
  | "eeoRace"
  | "eeoVeteran"
  | "eeoDisability"
  | "coverLetter";

const FILE_NOTE = "File uploads stay manual. Download the resume or cover letter and attach it yourself.";

export function splitLegalName(legalName: string): { first: string; last: string } {
  const parts = legalName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function isDecline(norm: string): boolean {
  return /prefer not|decline to|do not wish|dont wish|rather not|choose not to/.test(norm);
}

export function chooseOption(options: string[], desired: string): string | null {
  const wanted = normalizeQuestionLabel(desired);
  if (!wanted) return null;
  const exact = options.find((option) => normalizeQuestionLabel(option) === wanted);
  if (exact) return exact;
  if (isDecline(wanted)) {
    const decline = options.find((option) => isDecline(normalizeQuestionLabel(option)));
    if (decline) return decline;
  }
  const partial = options
    .map((option) => ({ option, norm: normalizeQuestionLabel(option) }))
    .filter((item) => item.norm.length >= 3 && (wanted.includes(item.norm) || item.norm.includes(wanted)))
    .sort((a, b) => b.norm.length - a.norm.length);
  return partial[0]?.option ?? null;
}

function looksLikeYesNo(options: string[]): boolean {
  if (options.length < 2 || options.length > 4) return false;
  return options.every((option) => {
    const norm = normalizeQuestionLabel(option);
    return norm === "yes" || norm === "no";
  });
}

function chooseListed(question: FormQuestion, desired: string): string {
  if (!desired) return "";
  if (!question.options?.length) return desired;
  return chooseOption(question.options, desired) ?? desired;
}

function blocksName(label: string): boolean {
  return /\b(company|user|manager|referr|file|project|team)\b/.test(label);
}

function classify(question: FormQuestion): ProfileField | "open_ended" | "file" | "unmapped" {
  if (question.type === "file") return "file";
  const label = normalizeQuestionLabel(question.label);
  if (!label) return "unmapped";

  if (question.type === "email" || /\bemail\b/.test(label)) return "email";
  if (question.type === "phone" || /\b(phone|mobile|telephone)\b/.test(label)) return "phone";
  if (/\blinkedin\b/.test(label)) return "linkedinUrl";
  if (/\bgithub\b/.test(label)) return "githubUrl";
  if (/\b(portfolio|personal site|personal website)\b/.test(label)) return "portfolioUrl";
  if (question.type === "url" && /\b(website|url)\b/.test(label) && !/\bcompany\b/.test(label)) {
    return "portfolioUrl";
  }
  if (!blocksName(label) && /\b(first name|given name)\b/.test(label)) return "firstName";
  if (!blocksName(label) && /\b(last name|surname|family name)\b/.test(label)) return "lastName";
  if (
    !blocksName(label) &&
    (/\b(legal name|full name|your name)\b/.test(label) || label === "name" || label === "candidate name")
  ) {
    return "legalName";
  }
  if (/\bpronouns?\b/.test(label)) return "pronouns";
  if (/\bcity\b/.test(label) && /\b(province|state)\b/.test(label)) return "location";
  if (/\bcity\b/.test(label)) return "city";
  if (/\b(province|state)\b/.test(label)) return "province";
  if (/\b(location|current location)\b/.test(label) || /where (are|do) you (live|based)/.test(label)) {
    return "location";
  }
  const sponsorship = /\bsponsor|\bvisa\b/.test(label);
  const authorization = /authoriz|authoris|eligible to work|right to work|\bcitizen|work permit|legally entitled/.test(label);
  if (sponsorship && !authorization) return "requiresSponsorship";
  if (authorization) return "workAuthorization";
  if (sponsorship) return "requiresSponsorship";
  if (/\brelocat/.test(label)) return "willingToRelocate";
  if (/\b(start date|earliest start|date available|available to start)\b/.test(label)) return "earliestStartDate";
  if (/\b(salary|compensation|expected pay|desired pay|pay expectation)\b/.test(label)) {
    return "salaryExpectationCad";
  }
  if (/how did you hear|where did you hear|how did you find|referral source/.test(label)) return "howDidYouHear";
  if (/\b(gender|sex)\b/.test(label)) return "eeoGender";
  if (/\b(race|ethnicity)\b/.test(label)) return "eeoRace";
  if (/\bveteran\b/.test(label)) return "eeoVeteran";
  if (/\bdisabilit/.test(label)) return "eeoDisability";
  if (/\bcover letter\b/.test(label)) return "coverLetter";
  if (
    question.type === "long_text" ||
    /\b(why|tell us|describe|walk us|interested|about yourself|motivation|strength|weakness)\b/.test(label)
  ) {
    return "open_ended";
  }
  return "unmapped";
}

function savedMatch(question: FormQuestion, profile: ApplicationProfile): string | null {
  const label = normalizeQuestionLabel(question.label);
  let best: { score: number; answer: string } | null = null;
  for (const saved of profile.savedAnswers) {
    const savedLabel = normalizeQuestionLabel(saved.question);
    if (!savedLabel || !saved.answer.trim()) continue;
    let score = 0;
    if (label === savedLabel) score = 100;
    else if (label.length >= 12 && savedLabel.length >= 12 && (label.includes(savedLabel) || savedLabel.includes(label))) {
      score = 80;
    } else {
      const left = new Set(label.split(" ").filter((word) => word.length > 2));
      const right = new Set(savedLabel.split(" ").filter((word) => word.length > 2));
      if (left.size >= 3 && right.size >= 3) {
        let overlap = 0;
        for (const word of left) if (right.has(word)) overlap += 1;
        const union = left.size + right.size - overlap;
        if (union > 0 && overlap / union >= 0.6) score = Math.round((overlap / union) * 70);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { score, answer: saved.answer.trim() };
  }
  return best ? best.answer : null;
}

function authorizationValue(profile: ApplicationProfile, question: FormQuestion): string {
  const options = question.options ?? [];
  if (options.length && looksLikeYesNo(options)) {
    const text = profile.workAuthorization.toLowerCase();
    if (!text.trim() || (text.includes("require") && text.includes("sponsor"))) return "No";
    return "Yes";
  }
  return profile.workAuthorization;
}

function valueForField(
  field: ProfileField,
  profile: ApplicationProfile,
  question: FormQuestion,
  coverLetterBody: string | null
): string {
  const location = [profile.city, profile.province].filter(Boolean).join(", ");
  switch (field) {
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
    case "linkedinUrl":
      return profile.linkedinUrl;
    case "githubUrl":
      return profile.githubUrl;
    case "portfolioUrl":
      return profile.portfolioUrl;
    case "workAuthorization":
      return chooseListed(question, authorizationValue(profile, question));
    case "requiresSponsorship":
      return chooseListed(question, profile.requiresSponsorship ? "Yes" : "No");
    case "willingToRelocate":
      return chooseListed(question, profile.willingToRelocate ? "Yes" : "No");
    case "earliestStartDate":
      return profile.earliestStartDate;
    case "salaryExpectationCad":
      if (profile.salaryExpectationCad == null) return "";
      return question.type === "number"
        ? String(profile.salaryExpectationCad)
        : `${profile.salaryExpectationCad} CAD`;
    case "pronouns":
      return profile.pronouns;
    case "howDidYouHear":
      return chooseListed(question, profile.howDidYouHear);
    case "eeoGender":
      return chooseListed(question, profile.eeoGender);
    case "eeoRace":
      return chooseListed(question, profile.eeoRace);
    case "eeoVeteran":
      return chooseListed(question, profile.eeoVeteran);
    case "eeoDisability":
      return chooseListed(question, profile.eeoDisability);
    case "coverLetter":
      return coverLetterBody?.trim() ?? "";
    default:
      return "";
  }
}

function kindFor(field: ProfileField | "open_ended" | "file" | "unmapped" | "saved"): AnswerKind {
  if (field === "coverLetter") return "cover_letter";
  if (field === "open_ended" || field === "file" || field === "unmapped" || field === "saved") return field;
  return "profile";
}

function sourceFor(kind: AnswerKind, answer: string): ValueSource {
  if (!answer.trim()) return "empty";
  if (kind === "saved") return "saved";
  if (kind === "cover_letter") return "cover_letter";
  if (kind === "open_ended") return "draft";
  if (kind === "profile") return "profile";
  return "empty";
}

export function mapFormQuestions(input: {
  questions: FormQuestion[];
  profile: ApplicationProfile;
  coverLetterBody: string | null;
  existingAnswers?: ExistingAnswer[];
}): MappedQuestion[] {
  const existingByLabel = new Map(
    (input.existingAnswers ?? []).map((answer) => [answer.question.trim(), answer])
  );

  return input.questions.map((item) => {
    const classified = classify(item);
    const saved = classified === "unmapped" || classified === "open_ended" ? savedMatch(item, input.profile) : null;
    const field = saved && classified !== "open_ended" ? "saved" : classified;
    const generated =
      field === "saved"
        ? saved ?? ""
        : field === "open_ended" || field === "file" || field === "unmapped"
          ? ""
          : valueForField(field, input.profile, item, input.coverLetterBody);
    const kind = kindFor(field === "saved" ? "saved" : classified === "open_ended" && saved ? "saved" : classified);
    const existing = existingByLabel.get(item.label.trim());
    const finalAnswer = existing?.finalAnswer;
    const hasFinal = finalAnswer !== null && finalAnswer !== undefined;
    const draftAnswer = existing?.draftAnswer?.trim() ? existing.draftAnswer : null;
    const openEnded = kind === "open_ended";

    let answer = generated;
    let valueSource = sourceFor(kind, generated);
    let needsDraft = openEnded && !saved && !draftAnswer && !hasFinal;
    let evidenceIds: string[] = [];
    let unsupportedClaims: string[] = [];

    if (hasFinal) {
      answer = finalAnswer;
      valueSource = "edited";
      needsDraft = false;
      evidenceIds = existing?.evidenceIds ?? [];
      unsupportedClaims = existing?.unsupportedClaims ?? [];
    } else if (openEnded && !saved && draftAnswer) {
      answer = draftAnswer;
      valueSource = "draft";
      needsDraft = false;
      evidenceIds = existing?.evidenceIds ?? [];
      unsupportedClaims = existing?.unsupportedClaims ?? [];
    } else if (saved && (classified === "open_ended" || classified === "unmapped")) {
      answer = saved;
      valueSource = "saved";
      needsDraft = false;
    }

    return {
      questionId: item.id,
      label: item.label,
      type: item.type,
      required: item.required,
      options: item.options,
      atsField: item.atsField,
      kind: saved && classified === "open_ended" ? "saved" : kind,
      valueSource,
      answer,
      evidenceIds,
      unsupportedClaims,
      needsDraft,
      note: item.type === "file" ? FILE_NOTE : null,
    };
  });
}
