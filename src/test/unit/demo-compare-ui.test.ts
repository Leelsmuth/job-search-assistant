// @vitest-environment jsdom
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_COMPARE_SESSION_KEY,
  DEMO_PRIORITIES_KEY,
  DEMO_STORAGE_KEY,
} from "@/modules/demo/storage-keys";
import { DEMO_COMPARE_DRAG_TYPE } from "@/modules/demo/demo-compare";
import { createDemoState } from "@/modules/demo/demo-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/demo",
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

import { DemoFeed } from "@/app/demo/demo-feed";
import { demoCompareActions } from "@/app/demo/demo-compare-store";
import { demoPriorityActions } from "@/app/demo/demo-priorities-store";

const NORTHWIND = "Senior Frontend Engineer at Northwind Labs";
const MAPLE = "Frontend Developer, Design Systems at Maple & Pine Commerce";
const QUILL = "Frontend Engineer, GraphQL at Quill Studio";
const LUMEN = "Staff Frontend Engineer at Lumen Health";
const TIDEWATER = "Senior Software Engineer, Web Platform at Tidewater Fintech";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
/** Unmounts a feed rendered by reloadFeed(), even when its test fails part way. */
let unmountFresh: (() => Promise<void>) | null = null;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  window.localStorage.clear();
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(createDemoState()));
  // The store is module state; empty it so every test starts with an empty tray.
  demoCompareActions.endDrag();
  demoCompareActions.clear();
  demoPriorityActions.useSuggested();
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(DemoFeed)));
});

afterEach(async () => {
  // Dialogs portal into document.body, so a leftover feed would leak into the next test.
  await unmountFresh?.();
  unmountFresh = null;
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** First button with this accessible label, inside `scope` (the whole page by default). */
function byLabel(label: string, scope: ParentNode = document): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === label
  );
  if (!found) throw new Error(`No button labelled ${label}`);
  return found;
}

function tray(): HTMLElement {
  return container.querySelector<HTMLElement>('[data-testid="compare-tray"]')!;
}

function trayStatus(): string {
  return tray().querySelector('[role="status"]')!.textContent ?? "";
}

function traySlots(): string[] {
  const list = tray().querySelector('ol[aria-label="Roles to compare"]')!;
  return Array.from(list.querySelectorAll("li:not([aria-hidden])"), (li) => li.textContent ?? "");
}

/** Every tray slot in order: the job's title, or null when the slot is empty. */
function slotTitles(): (string | null)[] {
  return Array.from(tray().querySelectorAll<HTMLElement>("[data-slot]"), (slot) =>
    slot.hasAttribute("aria-hidden") ? null : slot.querySelector("p")!.textContent
  );
}

function slot(index: number): HTMLElement {
  return tray().querySelector<HTMLElement>(`[data-slot="${index}"]`)!;
}

function compareButton(): HTMLButtonElement {
  const button = Array.from(tray().querySelectorAll("button")).find((candidate) =>
    /^Compare/.test(candidate.textContent ?? "")
  );
  if (!button) throw new Error("No Compare button in the tray");
  return button;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

/** The feed card for a sample job: the element that carries the drag handlers. */
function card(subject: string): HTMLElement {
  return byLabel(`Save ${subject}`).closest<HTMLElement>('[draggable="true"]')!;
}

/** Enough of DataTransfer for React's drag events; jsdom has no drag and drop. */
function fakeDataTransfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "all",
    get types() {
      return Array.from(data.keys());
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    setDragImage: vi.fn(),
  };
}

async function fire(target: Element, type: string, dataTransfer: ReturnType<typeof fakeDataTransfer>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

/**
 * Drag a job's card from the feed (or any draggable, such as a tray slot) and
 * drop it on `target`: a tray slot, or by default the tray outside the slots.
 */
async function dragToTray(from: string | HTMLElement, target: Element = tray()) {
  const dataTransfer = fakeDataTransfer();
  const source = typeof from === "string" ? card(from) : from;
  await fire(source, "dragstart", dataTransfer);
  await fire(target, "dragenter", dataTransfer);
  const over = await fire(target, "dragover", dataTransfer);
  const drop = await fire(target, "drop", dataTransfer);
  await fire(source, "dragend", dataTransfer);
  return { dataTransfer, over, drop };
}

describe("compare from the demo feed", () => {
  it("starts empty, with Compare disabled", () => {
    expect(traySlots()).toEqual([]);
    expect(compareButton().disabled).toBe(true);
    expect(trayStatus()).toContain("Compare 2 to 4 roles");
  });

  it("adds and removes roles with each job's Compare button", async () => {
    await click(byLabel(`Add ${NORTHWIND} to compare`));
    expect(traySlots()).toHaveLength(1);
    expect(compareButton().disabled).toBe(true);
    expect(trayStatus()).toBe(`Added ${NORTHWIND} to slot 1. Add one more role to compare.`);

    // The row's button turns into a pressed toggle.
    const rowToggle = byLabel(
      `Remove ${NORTHWIND} from compare`,
      container.querySelector('ul[aria-label="Sample jobs"]')!
    );
    expect(rowToggle.getAttribute("aria-pressed")).toBe("true");

    await click(byLabel(`Add ${MAPLE} to compare`));
    expect(compareButton().disabled).toBe(false);
    expect(compareButton().textContent).toContain("Compare 2 roles");

    await click(rowToggle);
    expect(traySlots()).toHaveLength(1);
    expect(compareButton().disabled).toBe(true);
  });

  it("adds a job dragged onto the tray", async () => {
    const { dataTransfer, over, drop } = await dragToTray(NORTHWIND);
    expect(dataTransfer.getData(DEMO_COMPARE_DRAG_TYPE)).toBe("northwind-senior-frontend");
    // The drag carries a compact chip, not the full-width card.
    expect(dataTransfer.setDragImage).toHaveBeenCalledTimes(1);
    const [preview, grabX] = dataTransfer.setDragImage.mock.calls[0] as [HTMLElement, number, number];
    expect(preview).not.toBe(card(NORTHWIND));
    expect(preview.dataset.compareDragPreview).toBe("northwind-senior-frontend");
    expect(preview.textContent).toBe("91fitSenior Frontend EngineerNorthwind Labs");
    expect(preview.className).toContain("w-60");
    expect(grabX).toBe(22);
    // It is only there for the browser's snapshot, then removed.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(preview.isConnected).toBe(false);
    // Cancelling dragover is what lets the browser drop on the tray.
    expect(over.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
    expect(traySlots()[0]).toContain("Senior Frontend Engineer");
    expect(tray().dataset.dropState).toBe("idle");
  });

  it("shows where to drop while a job is dragged", async () => {
    const dataTransfer = fakeDataTransfer();
    await fire(card(QUILL), "dragstart", dataTransfer);
    expect(tray().dataset.dropState).toBe("ready");
    expect(trayStatus()).toBe("Drop on a slot to choose its place.");
    // Over a slot: that slot lights up and the status says what letting go does.
    await fire(slot(2), "dragover", dataTransfer);
    expect(tray().dataset.dropState).toBe("over");
    expect(trayStatus()).toBe("Drop into slot 3.");
    expect(slot(2).textContent).toBe("Drop here");
    expect(slot(0).textContent).toBe("Slot 1");
    // Dropped somewhere else: nothing is added.
    await fire(card(QUILL), "dragend", dataTransfer);
    expect(tray().dataset.dropState).toBe("idle");
    expect(traySlots()).toEqual([]);
  });

  it("holds at most four roles", async () => {
    for (const subject of [NORTHWIND, MAPLE, QUILL, LUMEN]) await dragToTray(subject);
    expect(traySlots()).toHaveLength(4);
    expect(compareButton().textContent).toContain("Compare 4 roles");

    // A fifth drag is flagged while dragging, and refused with a reason on drop.
    const dataTransfer = fakeDataTransfer();
    await fire(card(TIDEWATER), "dragstart", dataTransfer);
    expect(tray().dataset.dropState).toBe("refused");
    expect(trayStatus()).toBe("Compare is full. Remove a role to add another.");
    await fire(tray(), "drop", dataTransfer);
    await fire(card(TIDEWATER), "dragend", dataTransfer);
    expect(traySlots()).toHaveLength(4);
    expect(trayStatus()).toBe(`Compare holds up to 4 roles. Remove one to add ${TIDEWATER}.`);

    // The button path is refused the same way.
    await click(byLabel(`Add ${TIDEWATER} to compare`));
    expect(traySlots()).toHaveLength(4);

    // Removing one frees its slot, and the others stay where they are.
    await click(byLabel(`Remove ${QUILL} from compare`, tray()));
    expect(slotTitles()).toEqual([
      "Senior Frontend Engineer",
      "Frontend Developer, Design Systems",
      null,
      "Staff Frontend Engineer",
    ]);
    await click(byLabel(`Add ${TIDEWATER} to compare`));
    expect(slotTitles()[2]).toBe("Senior Software Engineer, Web Platform");
  });

  it("does not add the same role twice", async () => {
    await dragToTray(NORTHWIND);
    await dragToTray(NORTHWIND);
    expect(traySlots()).toHaveLength(1);
    expect(trayStatus()).toBe(`${NORTHWIND} is already in slot 1.`);
  });

  it("puts a job in the slot it is dropped on, not the first empty one", async () => {
    await dragToTray(NORTHWIND, slot(2));
    expect(slotTitles()).toEqual([null, null, "Senior Frontend Engineer", null]);
    expect(trayStatus()).toBe(`Added ${NORTHWIND} to slot 3. Add one more role to compare.`);
    await dragToTray(MAPLE, slot(0));
    expect(slotTitles()).toEqual(["Frontend Developer, Design Systems", null, "Senior Frontend Engineer", null]);
    // The positions are kept for the tab, gaps included.
    expect(JSON.parse(window.sessionStorage.getItem(DEMO_COMPARE_SESSION_KEY)!)).toEqual([
      "maple-pine-design-systems",
      null,
      "northwind-senior-frontend",
      null,
    ]);
  });

  it("counts a drop on the text inside a slot as a drop on that slot", async () => {
    await dragToTray(NORTHWIND, slot(3));
    // The slot's title, not the slot itself, is what is under the pointer.
    await dragToTray(QUILL, slot(3).querySelector("p")!);
    // Nothing is free after slot 4, so Northwind makes room towards slot 3.
    expect(slotTitles()).toEqual([null, null, "Senior Frontend Engineer", "Frontend Engineer, GraphQL"]);
  });

  it("makes room when a job is dropped on a taken slot", async () => {
    await dragToTray(NORTHWIND, slot(0));
    await dragToTray(MAPLE, slot(1));
    const dataTransfer = fakeDataTransfer();
    await fire(card(QUILL), "dragstart", dataTransfer);
    await fire(slot(0), "dragover", dataTransfer);
    expect(trayStatus()).toBe("Drop into slot 1; 2 roles move over.");
    await fire(slot(0), "drop", dataTransfer);
    await fire(card(QUILL), "dragend", dataTransfer);
    expect(slotTitles()).toEqual([
      "Frontend Engineer, GraphQL",
      "Senior Frontend Engineer",
      "Frontend Developer, Design Systems",
      null,
    ]);
  });

  it("falls back to the first empty slot for drops between slots", async () => {
    await dragToTray(NORTHWIND, slot(0));
    await dragToTray(MAPLE); // on the tray, not a slot
    expect(slotTitles()).toEqual(["Senior Frontend Engineer", "Frontend Developer, Design Systems", null, null]);
  });

  it("reorders by dragging a tray slot onto another slot", async () => {
    await dragToTray(NORTHWIND, slot(0));
    await dragToTray(MAPLE, slot(1));
    await dragToTray(slot(0), slot(3));
    expect(slotTitles()).toEqual([null, "Frontend Developer, Design Systems", null, "Senior Frontend Engineer"]);
    expect(trayStatus()).toBe(`Moved ${NORTHWIND} to slot 4.`);
    // Dragging a job from the feed that is already in the tray moves it too.
    await dragToTray(MAPLE, slot(0));
    expect(slotTitles()).toEqual(["Frontend Developer, Design Systems", null, null, "Senior Frontend Engineer"]);
  });

  it("lines up the comparison in slot order", async () => {
    await dragToTray(NORTHWIND, slot(3));
    await dragToTray(MAPLE, slot(1));
    await click(compareButton());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const columns = Array.from(dialog.querySelectorAll('th[scope="col"]'), (th) => th.textContent);
    expect(columns).toEqual([
      expect.stringContaining("Frontend Developer, Design Systems"),
      expect.stringContaining("Senior Frontend Engineer"),
    ]);
  });

  it("ignores drags that are not feed jobs", async () => {
    const dataTransfer = fakeDataTransfer();
    dataTransfer.setData("text/uri-list", "https://example.com/");
    const over = await fire(tray(), "dragover", dataTransfer);
    expect(over.defaultPrevented).toBe(false);
    await fire(tray(), "drop", dataTransfer);
    expect(traySlots()).toEqual([]);
  });

  it("opens the roles side by side", async () => {
    for (const subject of [MAPLE, NORTHWIND, TIDEWATER]) {
      await click(byLabel(`Add ${subject} to compare`));
    }
    await click(compareButton());

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const columns = Array.from(dialog.querySelectorAll('th[scope="col"]'), (th) => th.textContent);
    expect(columns).toEqual([
      expect.stringContaining("Frontend Developer, Design Systems"),
      expect.stringContaining("Senior Frontend Engineer"),
      expect.stringContaining("Senior Software Engineer, Web Platform"),
    ]);
    const rowLabels = Array.from(dialog.querySelectorAll('th[scope="row"]'), (th) => th.textContent);
    for (const label of ["Fit", "Salary", "Eligibility", "Requirements", "Gap", "Tech stack"]) {
      expect(rowLabels.some((text) => text?.startsWith(label))).toBe(true);
    }

    const fitRow = rowWith(dialog, "Fit");
    expect(cellTexts(fitRow)[1]).toContain("Best fit"); // Northwind, 91
    expect(cellTexts(fitRow).filter((text) => text.includes("Best fit"))).toHaveLength(1);
    // CAD and USD are not ranked against each other.
    const salaryRow = rowWith(dialog, "Salary");
    expect(salaryRow.querySelector("th")!.textContent).toContain("CAD and USD, so not ranked");
    expect(salaryRow.textContent).not.toContain("Highest");
    expect(rowWith(dialog, "Eligibility").textContent).toContain("US auth");
    expect(rowWith(dialog, "Requirements").textContent).toContain("Strong React and TypeScript");

    // With three roles, one can be dropped from inside the comparison.
    await click(byLabel(`Remove ${TIDEWATER} from compare`, dialog));
    expect(dialog.querySelectorAll('th[scope="col"]')).toHaveLength(2);
    // At two, removing more would leave nothing to compare.
    expect(dialog.querySelector('thead button[aria-label^="Remove"]')).toBeNull();
  });

  it("keeps the tray for this tab in sessionStorage", async () => {
    await click(byLabel(`Add ${QUILL} to compare`));
    await click(byLabel(`Add ${NORTHWIND} to compare`));
    expect(JSON.parse(window.sessionStorage.getItem(DEMO_COMPARE_SESSION_KEY)!)).toEqual([
      "quill-graphql-frontend",
      "northwind-senior-frontend",
      null,
      null,
    ]);
    await click(Array.from(tray().querySelectorAll("button")).find((b) => b.textContent === "Clear")!);
    expect(window.sessionStorage.getItem(DEMO_COMPARE_SESSION_KEY)).toBeNull();
    // Picking roles to compare is not a demo change, so the demo stays resettable-free.
    expect(JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY)!).savedJobIds).toEqual(
      createDemoState().savedJobIds
    );
  });
});

/**
 * Unmount, then render the feed from fresh copies of every module, as after a
 * reload or a return visit: the stores read browser storage again. Fresh React
 * too, so hooks match; use the returned act and click with it.
 */
async function reloadFeed() {
  await act(async () => root.unmount());
  vi.resetModules();
  const FreshReact = await import("react");
  const { createRoot: freshCreateRoot } = await import("react-dom/client");
  const { DemoFeed: FreshFeed } = await import("@/app/demo/demo-feed");
  vi.stubGlobal("React", FreshReact);
  const freshRoot = freshCreateRoot(container);
  await FreshReact.act(async () => freshRoot.render(FreshReact.createElement(FreshFeed)));
  unmountFresh = () => FreshReact.act(async () => freshRoot.unmount());
  root = createRoot(container);
  return { click: (element: HTMLElement) => FreshReact.act(async () => element.click()) };
}

describe("compare tray restored from sessionStorage", () => {
  it("brings back the roles picked earlier in this tab", async () => {
    window.sessionStorage.setItem(
      DEMO_COMPARE_SESSION_KEY,
      JSON.stringify(["lumen-staff-frontend", "not-a-job", "maple-pine-design-systems"])
    );
    const fresh = await reloadFeed();

    expect(traySlots()).toEqual([
      expect.stringContaining("Staff Frontend Engineer"),
      expect.stringContaining("Frontend Developer, Design Systems"),
    ]);
    expect(compareButton().disabled).toBe(false);
  });
});

describe("saving the visitor's priorities", () => {
  function saveStatus(): HTMLElement {
    return document.querySelector<HTMLElement>('[data-testid="priorities-save-status"]')!;
  }

  function openPriorities(click: (element: HTMLElement) => Promise<unknown>) {
    return click(byLabel("Your priorities", tray()));
  }

  function priorityOrder(): string[] {
    return Array.from(document.querySelectorAll<HTMLElement>("li[data-priority]"), (li) => li.dataset.priority!);
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("says changes will be saved, confirms each save, then settles", async () => {
    window.localStorage.removeItem(DEMO_PRIORITIES_KEY);
    const fresh = await reloadFeed();
    await openPriorities(fresh.click);
    expect(saveStatus().textContent).toBe("Any change you make is saved in this browser for next time.");

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    await fresh.click(byLabel("Move Salary up"));
    expect(saveStatus().textContent).toBe("Saved just now in this browser.");
    expect(JSON.parse(window.localStorage.getItem(DEMO_PRIORITIES_KEY)!)[1]).toBe("salary");

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(saveStatus().textContent).toBe("Saved in this browser, so it's here next time.");
  });

  it("comes back on the next visit with the visitor's order, not the default", async () => {
    window.localStorage.setItem(
      DEMO_PRIORITIES_KEY,
      JSON.stringify(["remote", "salary", "fit", "location", "freshness"])
    );
    const fresh = await reloadFeed();
    await openPriorities(fresh.click);
    expect(priorityOrder()).toEqual(["remote", "salary", "fit", "location", "freshness"]);
    // Loaded, not just saved: no "just now".
    expect(saveStatus().textContent).toBe("Saved in this browser, so it's here next time.");
  });

  it("warns instead of claiming it saved when the browser blocks storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    await openPriorities(click);
    await click(byLabel("Move Salary up"));
    // The new order still applies for now.
    expect(priorityOrder()[1]).toBe("salary");
    expect(saveStatus().getAttribute("role")).toBe("alert");
    expect(saveStatus().textContent).toContain("your order lasts until you reload");
    expect(saveStatus().textContent).not.toContain("Saved");
  });
});

function rowWith(dialog: HTMLElement, label: string): HTMLTableRowElement {
  const header = Array.from(dialog.querySelectorAll('th[scope="row"]')).find((th) =>
    th.textContent?.startsWith(label)
  );
  if (!header) throw new Error(`No ${label} row`);
  return header.closest("tr")!;
}

function cellTexts(row: HTMLTableRowElement): string[] {
  return Array.from(row.querySelectorAll("td"), (td) => td.textContent ?? "");
}

describe("ranking priorities", () => {
  async function openComparison(subjects: string[]) {
    for (const subject of subjects) await click(byLabel(`Add ${subject} to compare`));
    await click(compareButton());
    return document.querySelector<HTMLElement>('[role="dialog"]')!;
  }

  function priorityOrder(scope: ParentNode): string[] {
    const list = scope.querySelector('ol[aria-label="Your priorities, most important first"]')!;
    return Array.from(list.querySelectorAll("li"), (li) => li.dataset.priority ?? "");
  }

  function verdictText(): string {
    return document.querySelector('[data-testid="compare-verdict"]')!.textContent ?? "";
  }

  function buttonByText(scope: ParentNode, text: string): HTMLButtonElement {
    const found = Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
    if (!found) throw new Error(`No button ${text}`);
    return found;
  }

  it("scores the compared roles and names the best one for the visitor", async () => {
    const dialog = await openComparison([NORTHWIND, LUMEN]);
    expect(priorityOrder(dialog)).toEqual(["fit", "location", "salary", "remote", "freshness"]);
    expect(verdictText()).toContain(
      "Best for your priorities: Senior Frontend Engineer at Northwind Labs, with 14 of 15 points."
    );
    const scoreRow = rowWith(dialog, "Your score");
    expect(cellTexts(scoreRow)[0]).toContain("Best for you");
    expect(cellTexts(scoreRow)[0]).toContain("Fit4.6 / 5");
    expect(cellTexts(scoreRow)[1]).toContain("#2");
  });

  it("re-ranks with the arrow buttons, keeps the order, and still points at the best fit", async () => {
    const dialog = await openComparison([NORTHWIND, LUMEN]);
    await click(byLabel("Move Salary up", dialog));
    await click(byLabel("Move Salary up", dialog));
    expect(priorityOrder(dialog)).toEqual(["salary", "fit", "location", "remote", "freshness"]);
    expect(JSON.parse(window.localStorage.getItem(DEMO_PRIORITIES_KEY)!)).toEqual([
      "salary",
      "fit",
      "location",
      "remote",
      "freshness",
    ]);
    expect(verdictText()).toContain("Best for your priorities: Staff Frontend Engineer at Lumen Health");
    expect(verdictText()).toContain("It leads on salary (your #1).");
    expect(verdictText()).toContain(
      "For the best chance of hearing back, Senior Frontend Engineer at Northwind Labs fits you best"
    );
    expect(dialog.querySelector('[role="status"].sr-only')!.textContent).toBe(
      "Salary moved to #1, worth 5 pts."
    );

    // Fit pushed down to #4: a tip, not an override.
    await click(byLabel("Move Fit down", dialog));
    await click(byLabel("Move Fit down", dialog));
    expect(priorityOrder(dialog)[3]).toBe("fit");
    expect(dialog.textContent).toContain("Fit is ranked #4.");

    await click(buttonByText(dialog, "Use suggested order (fit first)"));
    expect(priorityOrder(dialog)).toEqual(["fit", "location", "salary", "remote", "freshness"]);
    expect(dialog.textContent).not.toContain("Fit is ranked");
  });

  it("re-ranks by dragging a priority", async () => {
    const dialog = await openComparison([NORTHWIND, LUMEN]);
    const list = dialog.querySelector<HTMLOListElement>('ol[aria-label="Your priorities, most important first"]')!;
    const items = Array.from(list.querySelectorAll("li"));
    // jsdom has no layout: stack the items 50px tall with a 6px gap.
    items.forEach((item, index) => {
      const top = index * 56;
      item.getBoundingClientRect = () =>
        ({ top, bottom: top + 50, height: 50, left: 0, right: 300, width: 300, x: 0, y: top }) as DOMRect;
    });
    const salary = items[2];
    const pointer = async (type: string, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });
      Object.defineProperty(event, "pointerId", { value: 7 });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      await act(async () => {
        salary.dispatchEvent(event);
      });
    };

    await pointer("pointerdown", 137);
    await pointer("pointermove", 100);
    await pointer("pointermove", 10);
    // While dragging, the ranks preview the new order before anything is saved.
    expect(salary.textContent).toContain("#1");
    expect(salary.textContent).toContain("5 pts");
    expect(priorityOrder(dialog)).toEqual(["fit", "location", "salary", "remote", "freshness"]);

    await pointer("pointerup", 10);
    expect(priorityOrder(dialog)).toEqual(["salary", "fit", "location", "remote", "freshness"]);
    expect(verdictText()).toContain("Staff Frontend Engineer at Lumen Health");
  });

  it("a press without moving does not reorder", async () => {
    const dialog = await openComparison([NORTHWIND, LUMEN]);
    const item = dialog.querySelector<HTMLElement>('li[data-priority="salary"]')!;
    for (const type of ["pointerdown", "pointerup"]) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: 20, button: 0 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      await act(async () => {
        item.dispatchEvent(event);
      });
    }
    expect(priorityOrder(dialog)).toEqual(["fit", "location", "salary", "remote", "freshness"]);
  });

  it("can be set from the tray before comparing, then go straight to the comparison", async () => {
    await click(byLabel(`Add ${NORTHWIND} to compare`));
    await click(byLabel(`Add ${LUMEN} to compare`));
    await click(byLabel("Your priorities", tray()));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Your priorities");
    await click(byLabel("Move Remote up", dialog));
    expect(priorityOrder(dialog)).toEqual(["fit", "location", "remote", "salary", "freshness"]);

    await click(buttonByText(dialog, "Compare 2 roles"));
    const comparison = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(comparison.textContent).toContain("Compare roles");
    // The comparison uses the order set in the tray.
    expect(priorityOrder(comparison)).toEqual(["fit", "location", "remote", "salary", "freshness"]);
  });
});
