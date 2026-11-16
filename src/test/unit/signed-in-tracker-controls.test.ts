// @vitest-environment jsdom
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  status: vi.fn(),
  notes: vi.fn(),
  followUp: vi.fn(),
  appliedDate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/server/actions/application-tracker-actions", () => ({
  updateTrackedStatus: mocks.status,
  updateTrackedNotes: mocks.notes,
  updateTrackedFollowUp: mocks.followUp,
  updateTrackedAppliedDate: mocks.appliedDate,
}));

import { ApplicationControls } from "@/app/(dashboard)/applications/application-controls";

const application = {
  id: "signed-in-application",
  title: "Frontend Engineer",
  companyName: "Example Company",
  status: "saved" as const,
  notes: null,
  followUpDate: null,
  dateApplied: null,
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(ApplicationControls, { application, notesMode: "inline", showAppliedDate: true }));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function changeValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const nativeValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
    nativeValue!.set!.call(element, value);
    const event = element instanceof HTMLSelectElement ? "change" : "input";
    element.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

it("writes all tracker edits through the regular server actions without a demo adapter", async () => {
  await changeValue(container.querySelector("select")!, "applied");
  await changeValue(container.querySelector<HTMLInputElement>('input[aria-label^="Follow-up"]')!, "2026-06-20");
  await changeValue(container.querySelector<HTMLInputElement>('input[aria-label^="Date applied"]')!, "2026-06-15");
  await changeValue(container.querySelector("textarea")!, "Follow up about the frontend role");
  const save = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Save notes");
  await act(async () => save!.click());

  expect(mocks.status).toHaveBeenCalledExactlyOnceWith(application.id, "applied");
  expect(mocks.followUp).toHaveBeenCalledExactlyOnceWith(application.id, "2026-06-20");
  expect(mocks.appliedDate).toHaveBeenCalledExactlyOnceWith(application.id, "2026-06-15");
  expect(mocks.notes).toHaveBeenCalledExactlyOnceWith(application.id, "Follow up about the frontend role");
  expect(mocks.refresh).toHaveBeenCalledTimes(4);
  expect(window.localStorage.length).toBe(0);
});

it("restores the previous status when the signed-in server action rejects the update", async () => {
  mocks.status.mockRejectedValueOnce(new Error("Write failed"));
  const status = container.querySelector("select")!;
  await changeValue(status, "applied");

  expect(status.value).toBe("saved");
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Could not update status", description: "Write failed" }),
  );
});
