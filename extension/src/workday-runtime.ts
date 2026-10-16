import { detectWorkdayStep, workdayControlCount } from "@/modules/extension/workday/detect";
import { fillWorkdayStep } from "@/modules/extension/workday/fill";
import { markStepFilled, shouldAutoFillStep, workdayRequisitionKey } from "@/modules/extension/workday/session";
import type { WorkdayFillInput, WorkdayFillResult, WorkdaySession } from "@/modules/extension/workday/types";
import { emptyWorkdayHistory } from "@/modules/extension/workday/types";
import { watchWorkdayPage } from "@/modules/extension/workday/watch";
import { showWorkdayToast } from "@/modules/extension/workday/widgets";
import { loadWorkdaySession, saveWorkdaySession } from "./workday-session";

let chain: Promise<void> = Promise.resolve();
let memory: WorkdaySession | null = null;
let announced = "";
let authWarned = false;
let started = false;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function sessionFor(url: string): Promise<WorkdaySession> {
  const key = workdayRequisitionKey(url);
  if (memory?.requisitionKey === key) return memory;
  try {
    memory = await loadWorkdaySession(key);
  } catch {
    memory = { requisitionKey: key, filled: {} };
  }
  return memory;
}

async function remember(url: string, result: WorkdayFillResult) {
  if (result.blocked || result.step.id === "unknown") return;
  const current = await sessionFor(url);
  memory = markStepFilled(current, result.step.id, {
    controlCount: result.controlCount,
    experienceAdded: result.experienceAdded,
    educationAdded: result.educationAdded,
    skills: result.skillsAdded,
  });
  try {
    await saveWorkdaySession(memory);
  } catch {
    // The in-memory session still blocks a second auto-fill in this page.
  }
}

function inputFrom(message: Partial<WorkdayFillInput>): WorkdayFillInput {
  if (!message.profile) throw new Error("Missing profile");
  return {
    profile: message.profile,
    preparedAnswers: message.preparedAnswers ?? [],
    history: message.history ?? emptyWorkdayHistory(),
    coverLetterBody: message.coverLetterBody ?? null,
    resume: message.resume ?? null,
  };
}

export function fillWorkdayFromMessage(message: Partial<WorkdayFillInput>): Promise<WorkdayFillResult> {
  return enqueue(async () => {
    const result = await fillWorkdayStep(document, inputFrom(message));
    showWorkdayToast(document, result.message);
    await remember(location.href, result);
    return result;
  });
}

async function autoFill() {
  const step = detectWorkdayStep(document);
  if (step.id === "signIn" || step.id === "createAccount") {
    if (announced !== step.id) {
      announced = step.id;
      showWorkdayToast(document, "Sign in yourself. The extension does not enter passwords or create accounts.");
    }
    return;
  }
  if (step.id === "review") {
    if (announced !== step.id) {
      announced = step.id;
      showWorkdayToast(document, "Review step. The extension will not submit.");
    }
    return;
  }
  const session = await sessionFor(location.href);
  if (!shouldAutoFillStep(session, step.id, workdayControlCount(document))) return;
  let prepared: {
    profile?: WorkdayFillInput["profile"];
    preparedAnswers?: WorkdayFillInput["preparedAnswers"];
    history?: WorkdayFillInput["history"];
    coverLetterBody?: string | null;
    resume?: WorkdayFillInput["resume"];
    error?: string;
  };
  try {
    prepared = await chrome.runtime.sendMessage({
      type: "workday-prepare",
      pageUrl: location.href,
      includeResume: step.id === "myExperience" && Boolean(document.querySelector("input[type='file']")),
    });
  } catch {
    return;
  }
  if (!prepared || prepared.error || !prepared.profile) {
    if (!authWarned) {
      authWarned = true;
      showWorkdayToast(document, prepared?.error || "Link your account in the side panel, then fill this step.");
    }
    return;
  }
  if (detectWorkdayStep(document).id !== step.id) return;
  const result = await fillWorkdayStep(document, inputFrom(prepared));
  showWorkdayToast(document, result.message);
  await remember(location.href, result);
  announced = step.id;
}

export function startWorkdayAssistant() {
  if (started) return;
  started = true;
  watchWorkdayPage(document, (step) => {
    void chrome.runtime.sendMessage({ type: "workday-step-updated", step }).catch(() => undefined);
    void enqueue(() => autoFill()).catch(() => undefined);
  });
}
