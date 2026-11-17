// @vitest-environment jsdom
/**
 * The signed-in compare tray: the shared tray, comparison, and ranker on the
 * real job feed rows, backed by the account (AccountCompareProvider). Saves go
 * through injected actions, so each test decides what the server answers.
 */
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobListItem } from "@/modules/jobs/job-list-item";
import type { AccountCompareState } from "@/modules/compare/compare-db";
import type { CompareRole } from "@/modules/compare/role";
import { COMPARE_DRAG_TYPE } from "@/modules/compare/slots";
import type { CompareActions } from "@/app/(dashboard)/jobs/account-compare";
import type { ComparePrioritiesResult, CompareTrayResult } from "@/server/actions/compare-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/jobs",
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
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
// The feed row's other buttons call these; these tests never press them.
vi.mock("@/server/actions", () => ({
  toggleSaveJob: vi.fn(),
  dismissJob: vi.fn(),
  startReviewingJob: vi.fn(),
  deleteJob: vi.fn(),
  markJobAsApplied: vi.fn(),
  prepareJobApplication: vi.fn(),
}));
vi.mock("@/server/actions/compare-actions", () => ({
  saveCompareTray: vi.fn(),
  saveComparePriorities: vi.fn(),
}));

import { AccountCompareProvider } from "@/app/(dashboard)/jobs/account-compare";
import { JobFeedRow } from "@/app/(dashboard)/jobs/job-feed-row";
import { CompareTray } from "@/components/compare/compare-tray";

const ID = {
  shopify: "0b0b0b0b-0000-4000-8000-000000000001",
  wealthsimple: "0b0b0b0b-0000-4000-8000-000000000002",
  clio: "0b0b0b0b-0000-4000-8000-000000000003",
};

function listItem(id: string, title: string, company: string, fit: number): JobListItem {
  return {
    id,
    title,
    jobUrl: null,
    location: "Remote - Canada",
    workplaceType: "remote",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "CAD",
    isSaved: false,
    status: "active",
    dateDiscovered: new Date("2026-05-30T12:00:00.000Z"),
    postedAt: new Date("2026-05-30T12:00:00.000Z"),
    postedAtSource: "provider",
    company: { name: company },
    sourceProvider: null,
    requirements: [],
    technologies: [],
    locationClass: "remote_canada",
    locationFlags: [],
    frontendFit: { score: fit, reasons: [] },
    fitEligible: true,
    fitIneligibleReason: null,
    resumeScore: null,
    match: null,
  };
}

const FEED = [
  listItem(ID.shopify, "Senior Frontend Developer", "Shopify", 87),
  listItem(ID.wealthsimple, "Frontend Engineer, Web", "Wealthsimple", 82),
  listItem(ID.clio, "UI Engineer", "Clio", 74),
];

function role(item: JobListItem, overrides: Partial<CompareRole> = {}): CompareRole {
  return {
    id: item.id,
    title: item.title,
    company: item.company!.name,
    href: `/jobs/${item.id}`,
    fitScore: item.frontendFit!.score,
    classification: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "CAD",
    location: item.location,
    workplaceType: item.workplaceType,
    locationClass: "remote_canada",
    locationFlags: [],
    locationBlocker: null,
    postedAt: "2026-05-30T12:00:00.000Z",
    postedAtSource: "provider",
    fitReasons: [],
    topConcern: null,
    matchingSkills: [],
    requirements: [],
    niceToHave: [],
    technologies: [],
    trackerStatus: "Not saved",
    resumeScore: null,
    ...overrides,
  };
}

const ROLES = new Map(FEED.map((item) => [item.id, role(item)]));

/** What the server answers by default: it keeps the slots and sends the roles. */
function serverKeeps(slots: (string | null)[]): CompareTrayResult {
  return {
    ok: true,
    slots,
    roles: slots.filter((id): id is string => id !== null).map((id) => ROLES.get(id)!),
  };
}

function initialState(overrides: Partial<AccountCompareState> = {}): AccountCompareState {
  return {
    slots: [null, null, null, null],
    roles: [],
    priorities: { order: ["fit", "location", "salary", "remote", "freshness"], saved: false },
    available: true,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let actions: { saveTray: ReturnType<typeof vi.fn>; savePriorities: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  actions = {
    saveTray: vi.fn(async (slots: (string | null)[]) => serverKeeps(slots)),
    savePriorities: vi.fn(
      async (order: string[]): Promise<ComparePrioritiesResult> => ({ ok: true, order: order as never })
    ),
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Children passed to createElement, as the tracker tests do with TrackerAdapterProvider. */
const Provider = AccountCompareProvider as unknown as (
  props: Omit<React.ComponentProps<typeof AccountCompareProvider>, "children">
) => React.ReactNode;

async function render(initial = initialState()) {
  await act(async () =>
    root.render(
      createElement(
        Provider,
        {
          initial,
          feed: FEED.map((item) => ({
            id: item.id,
            title: item.title,
            company: item.company!.name,
            fitScore: item.frontendFit!.score,
          })),
          actions: actions as unknown as CompareActions,
        },
        createElement(
          "div",
          null,
          ...FEED.map((item) =>
            createElement(JobFeedRow, {
              key: item.id,
              job: item,
              isStale: false,
              lowExtraction: false,
              isNew: false,
            })
          ),
          createElement(CompareTray, { className: "inset-x-0 lg:left-56" })
        )
      )
    )
  );
}

/** Let queued saves and their answers run. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function byLabel(label: string, scope: ParentNode = document): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === label
  );
  if (!found) throw new Error(`No button labelled ${label}`);
  return found;
}

function buttonByText(scope: ParentNode, text: RegExp): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find((button) =>
    text.test(button.textContent ?? "")
  );
  if (!found) throw new Error(`No button ${text}`);
  return found;
}

function tray(): HTMLElement {
  return container.querySelector<HTMLElement>('[data-testid="compare-tray"]')!;
}

function trayStatus(): string {
  return tray().querySelector('[role="status"]')!.textContent ?? "";
}

function slotTitles(): (string | null)[] {
  return Array.from(tray().querySelectorAll<HTMLElement>("[data-slot]"), (slot) =>
    slot.hasAttribute("aria-hidden") ? null : slot.querySelector("p")!.textContent
  );
}

function slot(index: number): HTMLElement {
  return tray().querySelector<HTMLElement>(`[data-slot="${index}"]`)!;
}

function card(title: string): HTMLElement {
  const heading = Array.from(container.querySelectorAll("h3")).find((h) => h.textContent === title)!;
  return heading.closest<HTMLElement>('[draggable="true"]')!;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

async function dragOnto(title: string, target: Element) {
  const data = new Map<string, string>();
  const dataTransfer = {
    dropEffect: "none",
    effectAllowed: "all",
    get types() {
      return Array.from(data.keys());
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    setDragImage: vi.fn(),
  };
  const fire = async (element: Element, type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    await act(async () => {
      element.dispatchEvent(event);
    });
  };
  const source = card(title);
  await fire(source, "dragstart");
  await fire(target, "dragover");
  await fire(target, "drop");
  await fire(source, "dragend");
  return dataTransfer;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("compare on the signed-in job feed", () => {
  it("gives every feed row a Compare button and makes it draggable", async () => {
    await render();
    const button = byLabel("Add Senior Frontend Developer at Shopify to compare");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    const data = await dragOnto("Frontend Engineer, Web", slot(1));
    expect(data.getData(COMPARE_DRAG_TYPE)).toBe(ID.wealthsimple);
    // The compact drag preview, built from the feed row's own numbers.
    const preview = data.setDragImage.mock.calls[0][0] as HTMLElement;
    expect(preview.textContent).toBe("82fitFrontend Engineer, WebWealthsimple");
  });

  it("puts a dropped job in its slot at once, then saves the slots to the account", async () => {
    await render();
    await dragOnto("Senior Frontend Developer", slot(2));
    // Shown before the server answers.
    expect(slotTitles()).toEqual([null, null, "Senior Frontend Developer", null]);
    expect(trayStatus()).toBe("Added Senior Frontend Developer at Shopify to slot 3. Add one more role to compare.");
    await settle();
    expect(actions.saveTray).toHaveBeenCalledWith([null, null, ID.shopify, null]);
  });

  it("starts from the tray and ranking saved on the account", async () => {
    await render(
      initialState({
        slots: [null, ID.clio, null, ID.shopify],
        roles: [ROLES.get(ID.clio)!, ROLES.get(ID.shopify)!],
        priorities: { order: ["salary", "fit", "location", "remote", "freshness"], saved: true },
      })
    );
    expect(slotTitles()).toEqual([null, "UI Engineer", null, "Senior Frontend Developer"]);
    expect(byLabel("Remove Senior Frontend Developer at Shopify from compare", container.querySelector("main") ?? container).getAttribute("aria-pressed")).toBe("true");

    await click(byLabel("Your priorities", tray()));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(Array.from(dialog.querySelectorAll<HTMLElement>("li[data-priority]"), (li) => li.dataset.priority)).toEqual([
      "salary",
      "fit",
      "location",
      "remote",
      "freshness",
    ]);
    expect(dialog.querySelector('[data-testid="priorities-save-status"]')!.textContent).toBe(
      "Saved to your account, so it's here next time."
    );
  });

  it("compares once the server has sent the roles, in slot order", async () => {
    const answer = deferred<CompareTrayResult>();
    actions.saveTray.mockImplementationOnce(async (slots: (string | null)[]) => serverKeeps(slots));
    actions.saveTray.mockImplementationOnce(() => answer.promise);
    await render();
    await dragOnto("UI Engineer", slot(3));
    await settle();
    await dragOnto("Frontend Engineer, Web", slot(0));
    await click(buttonByText(tray(), /^Compare/));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    // Wealthsimple's details are not back yet.
    expect(dialog.textContent).toContain("Loading the roles…");

    answer.resolve(serverKeeps([ID.wealthsimple, null, null, ID.clio]));
    await settle();
    const columns = Array.from(dialog.querySelectorAll('th[scope="col"]'), (th) => th.textContent);
    expect(columns).toEqual([
      expect.stringContaining("Frontend Engineer, Web"),
      expect.stringContaining("UI Engineer"),
    ]);
    expect(dialog.querySelector('[data-testid="compare-verdict"]')!.textContent).toContain(
      "Best for your priorities: Frontend Engineer, Web at Wealthsimple"
    );
  });

  it("shows what the server kept when it refuses a job", async () => {
    actions.saveTray.mockImplementation(async (slots: (string | null)[]) =>
      serverKeeps(slots.map((id) => (id === ID.clio ? null : id)))
    );
    await render();
    await dragOnto("UI Engineer", slot(0));
    await settle();
    expect(slotTitles()).toEqual([null, null, null, null]);
  });

  it("puts the tray back and says so when saving fails", async () => {
    await render(initialState({ slots: [ID.shopify, null, null, null], roles: [ROLES.get(ID.shopify)!] }));
    const answer = deferred<CompareTrayResult>();
    actions.saveTray.mockImplementationOnce(() => answer.promise);
    await dragOnto("UI Engineer", slot(1));
    expect(slotTitles()).toEqual(["Senior Frontend Developer", "UI Engineer", null, null]);
    answer.resolve({ ok: false, reason: "failed" });
    await settle();
    expect(slotTitles()).toEqual(["Senior Frontend Developer", null, null, null]);
    expect(trayStatus()).toBe(
      "Could not save your compare tray, so it is back to how it was. Check your connection and try again."
    );
  });

  it("treats a request that never reaches the server as a failed save", async () => {
    await render();
    actions.saveTray.mockRejectedValueOnce(new Error("Failed to fetch"));
    await dragOnto("UI Engineer", slot(0));
    await settle();
    expect(slotTitles()).toEqual([null, null, null, null]);
  });

  it("applies only the latest answer when changes overlap, so the tray never jumps back", async () => {
    const first = deferred<CompareTrayResult>();
    const second = deferred<CompareTrayResult>();
    actions.saveTray.mockImplementationOnce(() => first.promise);
    actions.saveTray.mockImplementationOnce(() => second.promise);
    await render();
    await dragOnto("UI Engineer", slot(0));
    await dragOnto("Frontend Engineer, Web", slot(1));

    // The first save answers with only the first job while the newer change is still saving.
    first.resolve(serverKeeps([ID.clio, null, null, null]));
    await settle();
    expect(slotTitles()).toEqual(["UI Engineer", "Frontend Engineer, Web", null, null]);

    expect(actions.saveTray).toHaveBeenLastCalledWith([ID.clio, ID.wealthsimple, null, null]);
    second.resolve(serverKeeps([ID.clio, ID.wealthsimple, null, null]));
    await settle();
    expect(slotTitles()).toEqual(["UI Engineer", "Frontend Engineer, Web", null, null]);
  });

  it("saves the ranking to the account, and says so", async () => {
    const answer = deferred<ComparePrioritiesResult>();
    actions.savePriorities.mockImplementationOnce(() => answer.promise);
    await render();
    await click(byLabel("Your priorities", tray()));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const status = () => dialog.querySelector('[data-testid="priorities-save-status"]')!.textContent;
    expect(status()).toBe("Any change you make is saved to your account for next time.");

    await click(byLabel("Move Salary up", dialog));
    expect(status()).toBe("Saving…");
    expect(actions.savePriorities).toHaveBeenCalledWith(["fit", "salary", "location", "remote", "freshness"]);
    answer.resolve({ ok: true, order: ["fit", "salary", "location", "remote", "freshness"] });
    await settle();
    expect(status()).toBe("Saved just now to your account.");
  });

  it("keeps the new order for the page but says it is not saved when saving fails", async () => {
    actions.savePriorities.mockResolvedValueOnce({ ok: false, reason: "failed" });
    await render();
    await click(byLabel("Your priorities", tray()));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    await click(byLabel("Move Salary up", dialog));
    await settle();
    const status = dialog.querySelector<HTMLElement>('[data-testid="priorities-save-status"]')!;
    expect(status.getAttribute("role")).toBe("alert");
    expect(status.textContent).toContain("Could not save to your account");
    expect(dialog.querySelectorAll<HTMLElement>("li[data-priority]")[1].dataset.priority).toBe("salary");
  });

  it("works for the page, and says nothing is saved, before the migration is applied", async () => {
    await render(initialState({ available: false }));
    await click(byLabel("Add UI Engineer at Clio to compare"));
    expect(slotTitles()).toEqual(["UI Engineer", null, null, null]);
    expect(trayStatus()).toContain("Comparing is not set up on this database yet (migration 0025)");
    expect(actions.saveTray).not.toHaveBeenCalled();

    await click(byLabel("Your priorities", tray()));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const status = dialog.querySelector('[data-testid="priorities-save-status"]')!;
    // Never "saved to your account" when it cannot be.
    expect(status.textContent).toContain("not set up on this database yet");
    await click(byLabel("Move Salary up", dialog));
    expect(actions.savePriorities).not.toHaveBeenCalled();
  });
});
