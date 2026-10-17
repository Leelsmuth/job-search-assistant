import type { WorkdayFilledStep, WorkdaySession, WorkdayStepId } from "@/modules/extension/workday/types";
import { WORKDAY_STEP_IDS } from "@/modules/extension/workday/types";

const STORAGE_PREFIX = "jsa-workday-session:";

/**
 * Stable key for one job application. The wizard URL often gains /apply without
 * changing the requisition, and the locale prefix is optional.
 */
export function workdayRequisitionKey(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    let path = url.pathname.replace(/\/+$/, "");
    path = path.replace(/\/apply(?:\/(?:applymanually|usemyLastApplication|usemylastapplication|autofillwithresume))?$/i, "");
    path = path.replace(/^\/[a-z]{2}-[a-z]{2}(?=\/)/i, "");
    return `${url.origin}${path || "/"}`.toLowerCase();
  } catch {
    return pageUrl.trim().toLowerCase();
  }
}

export function sessionStorageKey(requisitionKey: string): string {
  return `${STORAGE_PREFIX}${requisitionKey}`;
}

export function emptyWorkdaySession(requisitionKey: string): WorkdaySession {
  return { requisitionKey, filled: {} };
}

function isStepId(value: string): value is WorkdayStepId {
  return (WORKDAY_STEP_IDS as readonly string[]).includes(value);
}

function filledStep(value: unknown): WorkdayFilledStep | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<WorkdayFilledStep>;
  return {
    at: typeof record.at === "number" ? record.at : Date.now(),
    controlCount: typeof record.controlCount === "number" ? record.controlCount : 0,
    experienceAdded: typeof record.experienceAdded === "number" ? record.experienceAdded : 0,
    educationAdded: typeof record.educationAdded === "number" ? record.educationAdded : 0,
    skills: Array.isArray(record.skills) ? record.skills.filter((item): item is string => typeof item === "string") : [],
  };
}

export function parseStoredSession(requisitionKey: string, value: unknown): WorkdaySession {
  const session = emptyWorkdaySession(requisitionKey);
  if (!value || typeof value !== "object") return session;
  const record = value as { filled?: unknown };
  if (!record.filled || typeof record.filled !== "object") return session;
  for (const [key, step] of Object.entries(record.filled as Record<string, unknown>)) {
    if (!isStepId(key)) continue;
    const parsed = filledStep(step);
    if (parsed) session.filled[key] = parsed;
  }
  return session;
}

export function markStepFilled(
  session: WorkdaySession,
  step: WorkdayStepId,
  detail: Omit<WorkdayFilledStep, "at"> & { at?: number }
): WorkdaySession {
  return {
    requisitionKey: session.requisitionKey,
    filled: {
      ...session.filled,
      [step]: {
        at: detail.at ?? Date.now(),
        controlCount: detail.controlCount,
        experienceAdded: detail.experienceAdded,
        educationAdded: detail.educationAdded,
        skills: detail.skills,
      },
    },
  };
}

/**
 * Auto-fill a step once. If more controls render after that pass, fill again.
 * Review, sign-in, and account creation are never auto-filled.
 */
export function shouldAutoFillStep(session: WorkdaySession, step: WorkdayStepId, controlCount: number): boolean {
  if (step === "signIn" || step === "createAccount" || step === "review" || step === "unknown") return false;
  const prior = session.filled[step];
  if (!prior) return true;
  return controlCount > prior.controlCount;
}
