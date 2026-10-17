import type { DetectedWorkdayStep, WorkdayStepId } from "@/modules/extension/workday/types";
import { workdayStepTitle } from "@/modules/extension/workday/types";

const RULES: Array<{ id: WorkdayStepId; pattern: RegExp }> = [
  { id: "createAccount", pattern: /create account|sign up/ },
  { id: "signIn", pattern: /sign in|log in/ },
  { id: "myInformation", pattern: /my information|personal information/ },
  { id: "myExperience", pattern: /my experience|^experience$/ },
  { id: "applicationQuestions", pattern: /application questions/ },
  { id: "voluntaryDisclosures", pattern: /voluntary disclosure/ },
  { id: "selfIdentify", pattern: /self[\s-]?identif/ },
  { id: "review", pattern: /^review\b|review and submit/ },
];

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function cleanStepTitle(value: string): string {
  return clean(value)
    .replace(/^\d+[\s.)-]*/, "")
    .replace(/^step\s*\d*[:.)-]?\s*/i, "")
    .trim();
}

function classifyTitle(value: string): WorkdayStepId | null {
  const text = cleanStepTitle(value).toLowerCase();
  if (!text || text.length > 120) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.id;
  }
  return null;
}

function textOf(element: Element | null | undefined): string {
  return clean(element?.textContent);
}

function firstMatch(titles: string[]): { id: WorkdayStepId; title: string } | null {
  for (const title of titles) {
    const id = classifyTitle(title);
    if (!id) continue;
    return { id, title: workdayStepTitle(id, cleanStepTitle(title)) };
  }
  return null;
}

function activeProgressTitle(doc: Document): string {
  const active =
    doc.querySelector("[data-automation-id='progressBarActiveStep']") ??
    doc.querySelector("[data-automation-id='progressBar'] [aria-current='step']") ??
    doc.querySelector("[data-automation-id='progressBar'] [aria-current='true']");
  return textOf(active);
}

function pageTitle(doc: Document): string {
  const titled = doc.querySelector(
    "[data-automation-id='applyFlowPageTitle'], [data-automation-id='pageHeaderTitleText'], [data-automation-id='stepTitle']"
  );
  return textOf(titled);
}

function headings(doc: Document): string[] {
  return [...doc.querySelectorAll("h1, h2, h3")].map((element) => textOf(element)).filter(Boolean);
}

function passwordStep(doc: Document): { id: WorkdayStepId; title: string } | null {
  const password = doc.querySelector("input[type='password']");
  if (!(password instanceof HTMLInputElement)) return null;
  const blob = [...doc.querySelectorAll("button, h1, h2, a")].map((element) => textOf(element)).join(" ").toLowerCase();
  if (/create account|sign up/.test(blob)) return { id: "createAccount", title: "Create account" };
  return { id: "signIn", title: "Sign in" };
}

export function detectWorkdayStep(doc: Document): DetectedWorkdayStep {
  const matched = firstMatch([activeProgressTitle(doc), pageTitle(doc), ...headings(doc)]);
  if (matched) return matched;
  return passwordStep(doc) ?? { id: "unknown", title: "This step" };
}

export function workdayControlCount(doc: Document): number {
  return doc.querySelectorAll(
    "input:not([type='hidden']), textarea, select, [role='radio'], [role='checkbox'], [role='spinbutton'], button[aria-haspopup='listbox'], [data-automation-id='add-button']"
  ).length;
}
