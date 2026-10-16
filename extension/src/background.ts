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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
