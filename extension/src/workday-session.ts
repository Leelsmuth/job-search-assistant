import { parseStoredSession, sessionStorageKey } from "@/modules/extension/workday/session";
import type { WorkdaySession } from "@/modules/extension/workday/types";

export async function loadWorkdaySession(requisitionKey: string): Promise<WorkdaySession> {
  const storageKey = sessionStorageKey(requisitionKey);
  const data = await chrome.storage.session.get(storageKey);
  return parseStoredSession(requisitionKey, data[storageKey]);
}

export async function saveWorkdaySession(session: WorkdaySession): Promise<void> {
  await chrome.storage.session.set({ [sessionStorageKey(session.requisitionKey)]: session });
}
