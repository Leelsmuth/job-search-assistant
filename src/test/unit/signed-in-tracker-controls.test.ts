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
  getApplication: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("next/link", () => {
  const { createElement: h } = require("react") as typeof import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) =>
      h("a", { href, ...props }, children),
  };
});
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/server/actions/application-tracker-actions", () => ({
  updateTrackedStatus: mocks.status,
  updateTrackedNotes: mocks.notes,
  updateTrackedFollowUp: mocks.followUp,
  updateTrackedAppliedDate: mocks.appliedDate,
  getTrackedApplication: mocks.getApplication,
}));

import ApplicationDetailPage from "@/app/(dashboard)/applications/[applicationId]/page";
import { ApplicationControls } from "@/app/(dashboard)/applications/application-controls";
import { ApplicationsBoard } from "@/app/(dashboard)/applications/applications-board";
import { ApplicationsList } from "@/app/(dashboard)/applications/applications-list";
import { TRACKER_STAGES, type TrackedApplicationDetail } from "@/modules/applications/tracker";

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
  // The server actions revalidate the tracker, which already refreshes this page.
  expect(mocks.refresh).not.toHaveBeenCalled();
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

function tracked(overrides: Partial<TrackedApplicationDetail> = {}): TrackedApplicationDetail {
  return {
    id: "app-1",
    jobId: "job-1",
    status: "saved",
    stage: "saved",
    notes: "Saved note",
    dateApplied: null,
    followUpDate: null,
    lastActivityAt: "2026-06-01T12:00:00.000Z",
    companyName: "Example Company",
    title: "Frontend Engineer",
    jobUrl: "https://example.com/jobs/1",
    location: "Toronto",
    workplaceType: "remote",
    locationLabel: "Toronto · Remote",
    fitScore: 80,
    attention: [],
    events: [],
    ...overrides,
  };
}

function byId<T extends HTMLElement>(id: string): T {
  const element = container.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`missing #${id}`);
  return element;
}

async function renderDetail(application: TrackedApplicationDetail) {
  mocks.getApplication.mockResolvedValue(application);
  const page = await ApplicationDetailPage({ params: Promise.resolve({ applicationId: application.id }) });
  await act(async () => {
    root.render(page);
  });
}

async function openNotes(subject: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="Edit notes for ${subject}"]`);
  if (!button) throw new Error(`missing edit notes for ${subject}`);
  await act(async () => button.click());
}

/**
 * Type a notes draft, save a status, then re-render with the server snapshot.
 * The draft must still be there, and Save must send it.
 */
async function expectDraftSurvivesStatusSave({
  initial,
  refreshed,
  render,
  notesId,
  statusId,
  compact,
  appliedId,
  followUpId,
}: {
  initial: TrackedApplicationDetail;
  refreshed: TrackedApplicationDetail;
  render: (application: TrackedApplicationDetail) => Promise<void>;
  notesId: string;
  statusId: string;
  compact: boolean;
  appliedId?: string;
  followUpId?: string;
}) {
  await render(initial);
  if (compact) await openNotes(`${initial.title} at ${initial.companyName}`);
  await changeValue(byId<HTMLTextAreaElement>(notesId), "Draft that must survive");
  await changeValue(byId<HTMLSelectElement>(statusId), refreshed.status);

  mocks.notes.mockResolvedValue({ changed: true, jobId: initial.jobId });
  await render(refreshed);

  const notes = byId<HTMLTextAreaElement>(notesId);
  expect(notes.value).toBe("Draft that must survive");
  expect(byId<HTMLSelectElement>(statusId).value).toBe(refreshed.status);
  if (appliedId) expect(byId<HTMLInputElement>(appliedId).value).toBe("2026-06-15");
  if (followUpId) expect(byId<HTMLInputElement>(followUpId).value).toBe("2026-07-01");

  const save = notes.parentElement?.querySelector("button");
  expect(save?.textContent?.trim()).toBe("Save notes");
  await act(async () => save!.click());

  expect(mocks.notes).toHaveBeenCalledExactlyOnceWith(initial.id, "Draft that must survive");
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Notes saved" }));
  expect(mocks.refresh).not.toHaveBeenCalled();
}

it("keeps an unsaved notes draft across a status save and the following server snapshot", async () => {
  const initial = tracked();
  await expectDraftSurvivesStatusSave({
    initial,
    refreshed: tracked({
      status: "applied",
      stage: "applied",
      dateApplied: "2026-06-15T12:00:00.000Z",
      followUpDate: "2026-07-01T12:00:00.000Z",
    }),
    render: renderDetail,
    notesId: `notes-${initial.id}`,
    statusId: `status-${initial.id}`,
    appliedId: `applied-on-${initial.id}`,
    followUpId: `follow-up-${initial.id}`,
    compact: false,
  });
});

it("keeps an unsaved notes draft in the list when a status save refreshes the row", async () => {
  const initial = tracked();
  await expectDraftSurvivesStatusSave({
    initial,
    refreshed: tracked({
      status: "applied",
      stage: "applied",
      followUpDate: "2026-07-01T12:00:00.000Z",
    }),
    render: async (application) => {
      await act(async () => {
        root.render(createElement(ApplicationsList, { applications: [application] }));
      });
    },
    notesId: `card-notes-${initial.id}`,
    statusId: `card-status-${initial.id}`,
    followUpId: `card-follow-up-${initial.id}`,
    compact: true,
  });
});

it("keeps an unsaved notes draft on the board when a status save stays in the same column", async () => {
  // recruiter_screen and interviewing share the interviewing column, so the card is not moved.
  const initial = tracked({ status: "recruiter_screen", stage: "interviewing" });
  await expectDraftSurvivesStatusSave({
    initial,
    refreshed: tracked({
      status: "interviewing",
      stage: "interviewing",
      followUpDate: "2026-07-01T12:00:00.000Z",
    }),
    render: async (application) => {
      await act(async () => {
        root.render(
          createElement(ApplicationsBoard, { applications: [application], stages: [...TRACKER_STAGES] }),
        );
      });
    },
    notesId: `notes-${initial.id}`,
    statusId: `status-${initial.id}`,
    followUpId: `follow-up-${initial.id}`,
    compact: true,
  });
});

it("replaces notes from the server only while the draft has no unsaved changes", async () => {
  const initial = tracked({ notes: "Old note" });
  await renderDetail(initial);
  expect(byId<HTMLTextAreaElement>(`notes-${initial.id}`).value).toBe("Old note");

  await renderDetail(tracked({ notes: "Note from the server" }));
  expect(byId<HTMLTextAreaElement>(`notes-${initial.id}`).value).toBe("Note from the server");

  await changeValue(byId<HTMLTextAreaElement>(`notes-${initial.id}`), "Unsaved draft");
  await renderDetail(tracked({ notes: "A newer server note" }));
  expect(byId<HTMLTextAreaElement>(`notes-${initial.id}`).value).toBe("Unsaved draft");
});

it("does not say notes were saved when the notes did not change", async () => {
  mocks.notes.mockResolvedValue({ changed: false, jobId: "job-1" });
  const save = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Save notes");
  await act(async () => save!.click());

  expect(mocks.notes).toHaveBeenCalledExactlyOnceWith(application.id, "");
  expect(mocks.toast).not.toHaveBeenCalled();
});
