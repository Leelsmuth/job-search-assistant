// @vitest-environment jsdom
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrackerAdapterProvider, type TrackerAdapter } from "@/components/applications/tracker-adapter";
import { DEMO_STORAGE_KEY } from "@/modules/demo/storage-keys";
import {
  createDemoState,
  demoApplicationId,
  type DemoApplication,
  type DemoState,
} from "@/modules/demo/demo-state";
import { isDemoJobId } from "@/modules/demo/sample-jobs";
import { demoJobHref } from "@/app/demo/demo-links";
import type { TrackerQuery } from "@/modules/applications/tracker";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  appliedDate: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/demo/applications",
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicStub() {
      return null;
    },
}));
vi.mock("next/link", () => {
  const ReactForMock = require("react") as typeof import("react");
  return {
    default: ReactForMock.forwardRef(function Link(
      { href, children, ...props }: { href: string; children?: React.ReactNode },
      ref: React.Ref<HTMLAnchorElement>,
    ) {
      return ReactForMock.createElement("a", { href, ref, ...props }, children);
    }),
  };
});
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { DemoTracker } from "@/app/demo/applications/demo-tracker";
import { DemoJobTrackerPanel } from "@/app/demo/jobs/[jobId]/demo-job-tracker-panel";
import { demoActions } from "@/app/demo/demo-store";

const LIST_QUERY: TrackerQuery = { view: "list", status: "all", sort: "activity", dir: "desc" };
const BOARD_QUERY: TrackerQuery = { ...LIST_QUERY, view: "board" };
const HARBOUR = "Full-Stack Engineer (React/Node) at Harbourline Logistics";

function imported(partial: Pick<DemoApplication, "id" | "jobId" | "job" | "status">): DemoApplication {
  return {
    notes: null,
    dateSaved: "2026-05-01T12:00:00.000Z",
    dateApplied: partial.status === "saved" ? null : "2026-05-02T12:00:00.000Z",
    followUpDate: null,
    updatedAt: "2026-05-02T12:00:00.000Z",
    ...partial,
  };
}

function seededState(): DemoState {
  const state = createDemoState(new Date("2026-06-01T12:00:00.000Z"));
  state.applications.push(
    imported({
      id: "demo-app-import-1",
      jobId: "import-1",
      status: "applied",
      job: {
        company: "No Link Co",
        title: "Backend Engineer",
        location: "Remote",
        workplaceType: "remote",
        jobUrl: null,
      },
    }),
    imported({
      id: "demo-app-import-2",
      jobId: "import-2",
      status: "saved",
      job: {
        company: "Linked Co",
        title: "Data Engineer",
        location: "Toronto",
        workplaceType: "hybrid",
        jobUrl: "https://linked.example.com/jobs/2",
      },
    }),
  );
  return state;
}

function demoAdapter(): TrackerAdapter {
  const jobHref = (application: { jobId: string }) =>
    isDemoJobId(application.jobId) ? demoJobHref(application.jobId) : null;
  return {
    updateStatus: async (id, status) => demoActions.setStatus(id, status),
    updateNotes: async (id, notes) => demoActions.setNotes(id, notes),
    updateFollowUp: async (id, date) => demoActions.setFollowUp(id, date),
    updateAppliedDate: mocks.appliedDate,
    applicationHref: jobHref,
    jobHref,
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  window.localStorage.clear();
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seededState()));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function withDemoAdapter(child: React.ReactNode) {
  const Provider = TrackerAdapterProvider as (props: { adapter: TrackerAdapter }) => React.ReactNode;
  return createElement(Provider, { adapter: demoAdapter() }, child);
}

async function renderTracker(query: TrackerQuery) {
  await act(async () => {
    root.render(withDemoAdapter(createElement(DemoTracker, { query })));
  });
}

function tableRow(company: string): HTMLTableRowElement {
  const row = [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((candidate) =>
    candidate.textContent?.includes(company),
  );
  if (!row) throw new Error(`missing row for ${company}`);
  return row;
}

function boardCard(company: string): HTMLElement {
  const card = [...container.querySelectorAll("article")].find((candidate) =>
    candidate.textContent?.includes(company),
  );
  if (!card) throw new Error(`missing card for ${company}`);
  return card;
}

async function changeValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const nativeValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
    nativeValue!.set!.call(element, value);
    const event = element instanceof HTMLSelectElement ? "change" : "input";
    element.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

it("shows No job link only when a demo row has neither a posting nor a job page", async () => {
  await renderTracker(LIST_QUERY);

  const sample = tableRow("Harbourline Logistics");
  expect(sample.textContent).toContain("View job");
  expect(sample.textContent).not.toContain("No job link");
  expect(sample.querySelector("a")?.getAttribute("href")).toBe(demoJobHref("harbourline-fullstack"));

  const posting = tableRow("Linked Co");
  expect(posting.textContent).toContain("Job posting");
  expect(posting.textContent).not.toContain("No job link");
  expect(posting.textContent).not.toContain("View job");
  expect(posting.querySelector("a")?.getAttribute("href")).toBe("https://linked.example.com/jobs/2");

  const unlinked = tableRow("No Link Co");
  expect(unlinked.textContent).toContain("No job link");
  expect(unlinked.querySelector("a")).toBeNull();

  await renderTracker(BOARD_QUERY);
  expect(boardCard("Harbourline Logistics").textContent).not.toContain("No job link");
  expect(boardCard("Harbourline Logistics").textContent).toContain("View job");
  expect(boardCard("No Link Co").textContent).toContain("No job link");
  expect(boardCard("Linked Co").textContent).not.toContain("No job link");
});

it("edits the applied date from the demo tracker the same way as the signed-in tracker", async () => {
  await renderTracker(LIST_QUERY);
  const listDates = container.querySelectorAll<HTMLInputElement>(`input[aria-label="Date applied for ${HARBOUR}"]`);
  // The list renders a card and a table; both carry the same date control.
  expect(listDates).toHaveLength(2);
  await changeValue(listDates[0]!, "2026-04-02");
  expect(mocks.appliedDate).toHaveBeenCalledExactlyOnceWith(
    demoApplicationId("harbourline-fullstack"),
    "2026-04-02",
  );

  mocks.appliedDate.mockClear();
  await renderTracker(BOARD_QUERY);
  const boardDate = boardCard("Harbourline Logistics").querySelector<HTMLInputElement>(
    'input[aria-label^="Date applied"]',
  );
  expect(boardDate).not.toBeNull();
  await changeValue(boardDate!, "2026-04-03");
  expect(mocks.appliedDate).toHaveBeenCalledExactlyOnceWith(
    demoApplicationId("harbourline-fullstack"),
    "2026-04-03",
  );
});

it("keeps a notes draft on the demo job page when a status save updates the tracker", async () => {
  await act(async () => {
    root.render(
      withDemoAdapter(
        createElement(DemoJobTrackerPanel, {
          jobId: "harbourline-fullstack",
          title: "Full-Stack Engineer (React/Node)",
          company: "Harbourline Logistics",
        }),
      ),
    );
  });

  const edit = container.querySelector<HTMLButtonElement>(`button[aria-label="Edit notes for ${HARBOUR}"]`);
  await act(async () => edit!.click());
  const notes = container.querySelector<HTMLTextAreaElement>("textarea")!;
  await changeValue(notes, "Draft that must survive");
  await changeValue(container.querySelector("select")!, "offer");

  expect(container.querySelector("textarea")?.value).toBe("Draft that must survive");
  expect(container.querySelector("select")?.value).toBe("offer");

  const save = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Save notes");
  await act(async () => save!.click());

  const stored = JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY) ?? "{}") as DemoState;
  const application = stored.applications.find((item) => item.jobId === "harbourline-fullstack");
  expect(application?.notes).toBe("Draft that must survive");
  expect(application?.status).toBe("offer");
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Notes saved" }));
});
