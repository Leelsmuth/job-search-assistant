import { apiPdf, apiRequest } from "./api";

const TOKEN_KEY = "extensionToken";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) throw new Error("Open the job page, then click the extension icon.");
  return tab.id;
}

async function collectTab() {
  const tabId = await activeTabId();
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  return chrome.tabs.sendMessage(tabId, { type: "collect" });
}

async function applyTab(message: unknown) {
  const tabId = await activeTabId();
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  return chrome.tabs.sendMessage(tabId, message);
}

async function extensionToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const value = stored[TOKEN_KEY];
  return typeof value === "string" && value.startsWith("jsa_") ? value : null;
}

async function prepareWorkday(pageUrl: string, includeResume: boolean) {
  const token = await extensionToken();
  if (!token) return { error: "Link your account in the side panel, then fill this step." };
  const context = (await apiRequest("/api/extension/fill", token, { pageUrl })) as {
    profile: unknown;
    preparedAnswers: unknown;
    history?: unknown;
    coverLetterBody: string | null;
    documents: { resume: { available: boolean } };
    job: { id: string } | null;
  };
  let resume: { filename: string; bytes: number[] } | null = null;
  if (includeResume && context.documents?.resume?.available) {
    const path = context.job
      ? `/api/extension/documents?kind=resume&jobId=${context.job.id}`
      : "/api/extension/documents?kind=resume";
    resume = await apiPdf(path, token);
  }
  return {
    profile: context.profile,
    preparedAnswers: context.preparedAnswers,
    history: context.history,
    coverLetterBody: context.coverLetterBody,
    resume,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "workday-step-updated") {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "workday-prepare") {
    prepareWorkday(String(message.pageUrl ?? ""), Boolean(message.includeResume))
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({ error: error instanceof Error ? error.message : "Could not load your profile" });
      });
    return true;
  }
  if (message?.type === "workday-fill-tab") {
    applyTab({ ...message, type: "workday-fill" })
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({ error: error instanceof Error ? error.message : "Could not fill this step" });
      });
    return true;
  }
  if (message?.type === "collect-tab") {
    collectTab()
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({ error: error instanceof Error ? error.message : "Could not read this page" });
      });
    return true;
  }
  if (message?.type === "apply-tab") {
    applyTab(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({ error: error instanceof Error ? error.message : "Could not fill this page" });
      });
    return true;
  }
  return false;
});
