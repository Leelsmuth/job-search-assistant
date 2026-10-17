import "./sidepanel.css";
import { planPageFill } from "@/modules/extension/map-page";
import type { ApplicationProfile } from "@/modules/apply/types";
import type { PageField, PreparedFillAnswer } from "@/modules/extension/page-types";
import type { DetectedWorkdayStep, WorkdayFillResult, WorkdayHistory } from "@/modules/extension/workday/types";
import { emptyWorkdayHistory } from "@/modules/extension/workday/types";
import type { PageProvider } from "@/modules/extension/urls";
import { apiPdf, apiRequest } from "./api";
import type { ApplyResult } from "./apply-page";

type Posting = {
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  url: string | null;
  workplaceType: "remote" | "hybrid" | "on_site" | null;
};

type CollectedPage = {
  url: string;
  provider: PageProvider;
  headings: string[];
  buttons: string[];
  fields: PageField[];
  posting: Posting;
  workdayStep: DetectedWorkdayStep | null;
};

type FillContext = {
  provider: PageProvider;
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    url: string | null;
    alreadyApplied: boolean;
  } | null;
  profile: ApplicationProfile;
  preparedAnswers: PreparedFillAnswer[];
  documents: {
    resume: { available: boolean; source: "tailored" | "default" | null; filename: string | null };
    coverLetter: { available: boolean; filename: string | null };
  };
  coverLetterBody: string | null;
  history?: WorkdayHistory;
};

const TOKEN_KEY = "extensionToken";

let stepLabel: HTMLElement | null = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "workday-step-updated" && stepLabel && message.step?.title) {
    stepLabel.textContent = `Step: ${message.step.title}`;
  }
});

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function field(label: string, value: string) {
  const wrap = el("label", undefined, label);
  const input = document.createElement("input");
  input.value = value;
  wrap.append(input);
  return { wrap, input };
}

async function token(): Promise<string | null> {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const value = stored[TOKEN_KEY];
  return typeof value === "string" && value.startsWith("jsa_") ? value : null;
}

async function message<T>(payload: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(payload)) as T & { error?: string };
  if (response && typeof response === "object" && "error" in response && response.error) {
    throw new Error(response.error);
  }
  return response;
}

function providerLabel(provider: string): string {
  if (provider === "other") return "This page";
  return provider[0].toUpperCase() + provider.slice(1);
}

async function render() {
  const root = document.querySelector("#app");
  if (!root) return;
  root.replaceChildren();
  root.append(el("h1", undefined, "Job Search Assistant"));
  root.append(
    el(
      "p",
      "muted",
      "Fills the current page from your profile and prepared answers. You review and submit. This extension will not submit."
    )
  );

  const saved = await token();
  const account = el("section", "card");
  account.append(el("strong", undefined, "Account"));
  if (!saved) {
    const tokenInput = document.createElement("input");
    tokenInput.type = "password";
    tokenInput.placeholder = "Paste the token from Settings";
    tokenInput.autocomplete = "off";
    const save = el("button", undefined, "Link account");
    const status = el("p", "error");
    save.addEventListener("click", () => {
      const value = tokenInput.value.trim();
      status.textContent = "";
      if (!value.startsWith("jsa_")) {
        status.textContent = "Paste the token from Settings → Browser extension.";
        return;
      }
      void chrome.storage.local.set({ [TOKEN_KEY]: value }).then(() => render());
    });
    account.append(tokenInput, save, status);
    root.append(account);
    return;
  }

  const linked = el("p", "ok", "Linked");
  const unlink = el("button", "secondary", "Unlink");
  unlink.addEventListener("click", () => {
    void chrome.storage.local.remove(TOKEN_KEY).then(() => render());
  });
  account.append(linked, unlink);
  try {
    const session = (await apiRequest("/api/extension/session", saved)) as { expiresAt?: string };
    if (session.expiresAt) account.append(el("p", "muted", `Token expires ${new Date(session.expiresAt).toLocaleString()}`));
  } catch (error) {
    account.append(el("p", "error", error instanceof Error ? error.message : "Could not reach the app"));
  }
  root.append(account);

  const pageCard = el("section", "card");
  pageCard.append(el("strong", undefined, "This page"));
  const status = el("p", "muted", "Reading the open tab…");
  pageCard.append(status);
  root.append(pageCard);

  let collected: CollectedPage;
  try {
    collected = await message<CollectedPage>({ type: "collect-tab" });
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not read this page";
    return;
  }

  const stepTitle = collected.workdayStep?.title;
  status.textContent = stepTitle
    ? `${providerLabel(collected.provider)} · ${stepTitle} · ${collected.fields.length} field${collected.fields.length === 1 ? "" : "s"}`
    : `${providerLabel(collected.provider)} · ${collected.fields.length} field${collected.fields.length === 1 ? "" : "s"}`;
  let context: FillContext | null = null;
  try {
    context = (await apiRequest("/api/extension/fill", saved, { pageUrl: collected.url })) as FillContext;
  } catch (error) {
    pageCard.append(el("p", "error", error instanceof Error ? error.message : "Could not load your profile"));
  }

  if (context?.job) {
    pageCard.append(el("p", undefined, `${context.job.title} · ${context.job.company}`));
    if (context.job.alreadyApplied) pageCard.append(el("p", "muted", "This job is already marked applied."));
    if (!context.preparedAnswers.length) {
      pageCard.append(el("p", "muted", "No prepared answers for this job. Profile fields can still be filled."));
    }
  } else {
    pageCard.append(el("p", "muted", "No saved job matches this URL. Profile fields can still be filled."));
  }
  if (collected.provider === "workday") {
    stepLabel = el("p", undefined, `Step: ${collected.workdayStep?.title ?? "This step"}`);
    pageCard.append(stepLabel);
    pageCard.append(
      el(
        "p",
        "muted",
        "Workday fills the step that is on screen. Click Save and Continue yourself. The extension will not submit, and it will not type a password or create an account."
      )
    );
  } else {
    stepLabel = null;
  }

  const actions = el("div", "row");
  const fillButton = el("button", undefined, collected.provider === "workday" ? "Fill this step" : "Fill this page");
  const appliedButton = el("button", "secondary", "Mark as applied");
  actions.append(fillButton, appliedButton);
  pageCard.append(actions);
  const result = el("div");
  pageCard.append(result);
  let lastFilled: Array<{ question: string; answer: string }> = [];

  fillButton.addEventListener("click", () => {
    if (!context) return;
    fillButton.disabled = true;
    result.replaceChildren(el("p", "muted", "Filling…"));
    void (async () => {
      try {
        if (collected.provider === "workday") {
          const fresh = await message<CollectedPage>({ type: "collect-tab" });
          const step = fresh.workdayStep;
          if (stepLabel && step?.title) stepLabel.textContent = `Step: ${step.title}`;
          if (step?.id === "review") {
            result.replaceChildren(el("p", undefined, "Review step. The extension will not submit."));
            return;
          }
          if (step?.id === "signIn" || step?.id === "createAccount") {
            result.replaceChildren(
              el("p", undefined, "Sign in yourself. The extension does not enter passwords or create accounts.")
            );
            return;
          }
          let resume: { filename: string; bytes: number[] } | null = null;
          if (step?.id === "myExperience" && context.documents.resume.available) {
            const pdf = context.job
              ? await apiPdf(`/api/extension/documents?kind=resume&jobId=${context.job.id}`, saved)
              : await apiPdf("/api/extension/documents?kind=resume", saved);
            resume = pdf;
          }
          const applied = await message<WorkdayFillResult>({
            type: "workday-fill-tab",
            profile: context.profile,
            preparedAnswers: context.preparedAnswers,
            history: context.history ?? emptyWorkdayHistory(),
            coverLetterBody: context.coverLetterBody,
            resume,
          });
          result.replaceChildren();
          lastFilled = applied.filled.map((item) => ({ question: item.label, answer: item.value }));
          result.append(el("p", applied.blocked ? undefined : "ok", applied.message));
          if (applied.filled.length) {
            const list = el("ul");
            for (const item of applied.filled) list.append(el("li", undefined, `${item.label}: ${item.value || "attached"}`));
            result.append(el("p", undefined, "Filled"), list);
          }
          if (applied.attention.length) {
            const list = el("ul");
            for (const item of applied.attention) list.append(el("li", undefined, `${item.label}: ${item.reason}`));
            result.append(el("p", undefined, "Needs you"), list);
          }
          if (applied.skipped.length) {
            result.append(el("p", "muted", `Left existing values: ${applied.skipped.join(", ")}`));
          }
          return;
        }
        const planned = planPageFill({
          provider: collected.provider,
          headings: collected.headings,
          buttons: collected.buttons,
          fields: collected.fields,
          profile: context.profile,
          preparedAnswers: context.preparedAnswers,
          documents: {
            resume: context.documents.resume.available,
            coverLetter: context.documents.coverLetter.available,
            coverLetterBody: context.coverLetterBody,
          },
        });
        if (planned.reviewStep) {
          result.replaceChildren(el("p", undefined, planned.reviewNote ?? "Review step."));
          return;
        }
        const files = [];
        const needsResume = planned.fills.some((fill) => fill.fileRole === "resume");
        const needsLetter = planned.fills.some((fill) => fill.fileRole === "coverLetter");
        if (needsResume && context.job) {
          const pdf = await apiPdf(`/api/extension/documents?kind=resume&jobId=${context.job.id}`, saved);
          files.push({ role: "resume" as const, ...pdf });
        } else if (needsResume) {
          const pdf = await apiPdf("/api/extension/documents?kind=resume", saved);
          files.push({ role: "resume" as const, ...pdf });
        }
        if (needsLetter && context.job) {
          const pdf = await apiPdf(
            `/api/extension/documents?kind=coverLetter&jobId=${context.job.id}`,
            saved
          );
          files.push({ role: "coverLetter" as const, ...pdf });
        }
        const applied = await message<ApplyResult>({
          type: "apply-tab",
          reviewStep: false,
          fills: planned.fills,
          files,
          attentionKeys: planned.attention.map((item) => item.key),
        });
        result.replaceChildren();
        lastFilled = applied.filled.map((item) => ({ question: item.label, answer: item.value }));
        result.append(el("p", "ok", `Filled ${applied.filled.length}. You still submit the form.`));
        if (applied.filled.length) {
          const list = el("ul");
          for (const item of applied.filled) {
            list.append(el("li", undefined, `${item.label}: ${item.value || "attached"}`));
          }
          result.append(el("p", undefined, "Filled"), list);
        }
        const attention = [...planned.attention.map((item) => `${item.label}: ${item.reason}`), ...applied.attention];
        if (attention.length) {
          const list = el("ul");
          for (const item of attention) list.append(el("li", undefined, item));
          result.append(el("p", undefined, "Needs attention"), list);
        }
        if (applied.skipped.length) {
          result.append(el("p", "muted", `Left existing values: ${applied.skipped.join(", ")}`));
        }
      } catch (error) {
        result.replaceChildren(el("p", "error", error instanceof Error ? error.message : "Could not fill this page"));
      } finally {
        fillButton.disabled = false;
      }
    })();
  });

  appliedButton.addEventListener("click", () => {
    appliedButton.disabled = true;
    void (async () => {
      try {
        const response = (await apiRequest("/api/extension/applied", saved, {
          jobId: context?.job?.id ?? null,
          pageUrl: collected.url,
          title: context?.job?.title ?? collected.posting.title,
          company: context?.job?.company ?? collected.posting.company,
          location: context?.job?.location ?? collected.posting.location,
          description: collected.posting.description,
          filled: lastFilled,
        })) as { alreadyApplied?: boolean };
        result.replaceChildren(
          el("p", "ok", response.alreadyApplied ? "Already marked applied." : "Marked as applied in the tracker.")
        );
      } catch (error) {
        result.replaceChildren(el("p", "error", error instanceof Error ? error.message : "Could not mark applied"));
      } finally {
        appliedButton.disabled = false;
      }
    })();
  });

  const tracker = el("section", "card");
  tracker.append(el("strong", undefined, "Save to tracker"));
  tracker.append(el("p", "muted", "Best-effort capture. Check it, then save. Duplicate URLs are kept as one entry."));
  const title = field("Role", collected.posting.title ?? context?.job?.title ?? "");
  const company = field("Company", collected.posting.company ?? context?.job?.company ?? "");
  const location = field("Location", collected.posting.location ?? context?.job?.location ?? "");
  const save = el("button", undefined, "Save to tracker");
  const saveStatus = el("p");
  save.addEventListener("click", () => {
    save.disabled = true;
    saveStatus.textContent = "";
    void apiRequest("/api/extension/tracker", saved, {
      title: title.input.value,
      company: company.input.value,
      location: location.input.value,
      jobUrl: collected.posting.url ?? collected.url,
      description: collected.posting.description,
      workplaceType: collected.posting.workplaceType,
    })
      .then((response) => {
        const deduped = Boolean(response && typeof response === "object" && "deduped" in response && response.deduped);
        saveStatus.className = "ok";
        saveStatus.textContent = deduped ? "This URL is already in the tracker." : "Saved to the tracker.";
      })
      .catch((error: unknown) => {
        saveStatus.className = "error";
        saveStatus.textContent = error instanceof Error ? error.message : "Could not save";
      })
      .finally(() => {
        save.disabled = false;
      });
  });
  tracker.append(title.wrap, company.wrap, location.wrap, save, saveStatus);
  if (collected.posting.description) {
    tracker.append(el("p", "muted", collected.posting.description.slice(0, 280)));
  }
  root.append(tracker);
}

void render();
