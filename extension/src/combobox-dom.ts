import {
  canActivateLabel,
  runComboboxFill,
  type ComboboxPlan,
  type ComboboxSession,
} from "@/modules/extension/combobox";
import { setNativeValue } from "@/modules/extension/dom-value";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Opens a custom select or chooses a listbox option. Refuses submit, apply, and next. */
export function activateControl(element: HTMLElement): boolean {
  const label = `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`.replace(/\s+/g, " ").trim();
  if (!canActivateLabel(label, element.getAttribute("type"))) return false;
  const view = element.ownerDocument.defaultView ?? window;
  const pointer = (type: string) => new MouseEvent(type, { bubbles: true, cancelable: true, view });
  element.dispatchEvent(pointer("mousedown"));
  element.dispatchEvent(pointer("mouseup"));
  element.dispatchEvent(pointer("click"));
  return true;
}

function queryInput(element: Element): HTMLInputElement | null {
  if (element instanceof HTMLInputElement) return element;
  const container = element.closest(".iti, .select") ?? element.parentElement;
  const search = container?.querySelector("input.iti__search-input, input[role='combobox'], input.select__input");
  return search instanceof HTMLInputElement ? search : null;
}

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function selectedText(element: Element): string {
  const container = element.closest(".select, .iti") ?? element.parentElement;
  const single = container?.querySelector(".select__single-value, [class*='single-value'], [class*='singleValue']");
  const singleText = clean(single?.textContent);
  if (singleText) return singleText;
  const valueContainer = container?.querySelector(".select__value-container, [class*='value-container']");
  if (valueContainer instanceof HTMLElement) {
    const clone = valueContainer.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, [class*='placeholder']").forEach((node) => node.remove());
    const text = clean(clone.textContent);
    if (text) return text;
  }
  if (element instanceof HTMLButtonElement) return clean(element.getAttribute("title") || element.getAttribute("aria-label"));
  if (element instanceof HTMLInputElement && element.getAttribute("aria-expanded") !== "true") return clean(element.value);
  return "";
}

function visible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
}

function optionText(element: HTMLElement): string {
  const name = element.querySelector(".iti__country-name");
  const dial = element.querySelector(".iti__dial-code");
  if (name) return clean(`${name.textContent ?? ""} ${dial?.textContent ?? ""}`);
  return clean(element.textContent);
}

function optionNodes(element: Element): HTMLElement[] {
  const controls = element.getAttribute("aria-controls");
  const controlled = controls ? element.ownerDocument.getElementById(controls) : null;
  const root: ParentNode = controlled ?? element.ownerDocument;
  return [...root.querySelectorAll("[role='option'], .select__option, .iti__country")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement && visible(node)
  );
}

function sessionFor(element: HTMLElement): ComboboxSession {
  return {
    selected: () => selectedText(element),
    focus() {
      queryInput(element)?.focus();
      element.focus();
    },
    open() {
      if (element.getAttribute("aria-expanded") === "true") return;
      activateControl(element);
      const input = queryInput(element);
      if (input && input !== element) activateControl(input);
      if (element.getAttribute("aria-expanded") === "true" || input?.getAttribute("aria-expanded") === "true") return;
      const container = element.closest(".select, .iti") ?? element.parentElement?.parentElement;
      const toggle = container?.querySelector("button[aria-label='Toggle flyout'], button[aria-label*='open' i]");
      if (toggle instanceof HTMLElement) activateControl(toggle);
      const target = input ?? element;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    },
    setQuery(query: string) {
      const input = queryInput(element);
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setNativeValue(input, query, setter);
    },
    readOptions() {
      return optionNodes(element).map(optionText).filter(Boolean);
    },
    choose(option: string) {
      if (!canActivateLabel(option, null)) return false;
      const match = optionNodes(element).find((node) => optionText(node) === option);
      if (!match) return false;
      return activateControl(match);
    },
    dismiss() {
      const input = queryInput(element);
      const target = input ?? element;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setNativeValue(input, "", setter);
    },
  };
}

/**
 * Open the combobox, type to filter, wait for options, choose the closest match, and verify it.
 * This will not submit and will not press Enter.
 */
export function fillComboboxElement(element: HTMLElement, plan: ComboboxPlan) {
  return runComboboxFill(sessionFor(element), plan, sleep);
}
