import { chooseOption } from "@/modules/apply/map-questions";
import { normalizeQuestionLabel } from "@/modules/apply/questions";
import { canActivateLabel } from "@/modules/extension/combobox";
import { assignFileList, setNativeChecked, setNativeValue } from "@/modules/extension/dom-value";

export function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** CSS.escape when the DOM provides it; a local fallback for jsdom test runs. */
export function cssEscape(value: string): string {
  const css = globalThis.CSS;
  if (css && typeof css.escape === "function") return css.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

export function isShown(element: HTMLElement): boolean {
  if (element.hidden) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest("[hidden]")) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return true;
  const style = view.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

export function isForbiddenWorkdayAutomationId(id: string): boolean {
  const key = id.trim().toLowerCase();
  if (!key) return false;
  if (key.includes("password")) return true;
  if (key.includes("next")) return true;
  if (key.includes("submit")) return true;
  if (key.includes("signin") || key.includes("sign-in")) return true;
  if (key.includes("createaccount") || key.includes("create-account")) return true;
  return false;
}

function buttonLabel(element: Element): string {
  return cleanText(element.textContent) || cleanText(element.getAttribute("aria-label"));
}

/** True when activating this element could submit, continue, sign in, or create an account. */
export function isForbiddenClick(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (isForbiddenWorkdayAutomationId(current.getAttribute("data-automation-id") ?? "")) return true;
    if (current instanceof HTMLInputElement && current.type === "password") return true;
    if (current instanceof HTMLButtonElement || (current instanceof HTMLInputElement && /button|submit/.test(current.type))) {
      const typeAttr = (current.getAttribute("type") || "").toLowerCase();
      const label = buttonLabel(current);
      const add =
        /^add\b/i.test(label) || (current.getAttribute("data-automation-id") || "").toLowerCase() === "add-button";
      if (typeAttr === "submit" && !add) return true;
      if (!canActivateLabel(label, add ? "button" : typeAttr || "button")) return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Activates a Workday control with bubbling mouse events.
 * Synthetic events are not trusted, so they do not submit a form.
 * Save and Continue, Next, Submit, sign-in, and password controls are refused.
 */
export function clickWorkdayControl(element: HTMLElement): boolean {
  if (isForbiddenClick(element)) return false;
  const mouse = (type: string) => new MouseEvent(type, { bubbles: true, cancelable: true });
  element.dispatchEvent(mouse("mousedown"));
  element.dispatchEvent(mouse("mouseup"));
  element.dispatchEvent(mouse("click"));
  return true;
}

function valueSetter(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, "value")?.set;
}

/** React-controlled write: native setter, then input, change, and blur. */
export function setReactValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  setNativeValue(element, value, valueSetter(element));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

export function setReactChecked(element: HTMLInputElement, checked: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  setNativeChecked(element, checked, setter);
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

export function ensureAttentionStyle(doc: Document) {
  if (doc.getElementById("jsa-attention-style")) return;
  const style = doc.createElement("style");
  style.id = "jsa-attention-style";
  style.textContent = ".jsa-needs-attention{outline:2px solid #b45309 !important;outline-offset:2px;}";
  doc.documentElement.appendChild(style);
}

export function highlightField(element: Element) {
  ensureAttentionStyle(element.ownerDocument);
  element.classList.add("jsa-needs-attention");
}

export function showWorkdayToast(doc: Document, message: string) {
  const existing = doc.getElementById("jsa-workday-toast");
  existing?.remove();
  if (!doc.getElementById("jsa-workday-toast-style")) {
    const style = doc.createElement("style");
    style.id = "jsa-workday-toast-style";
    style.textContent = [
      "#jsa-workday-toast{position:fixed;right:16px;bottom:16px;z-index:2147483646;max-width:320px;",
      "background:#1c1917;color:#fff;padding:12px 14px;border-radius:10px;",
      "font:14px/1.4 'Segoe UI',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);}",
      "#jsa-workday-toast button{margin-top:8px;background:#fff;color:#1c1917;border:0;border-radius:8px;padding:4px 8px;cursor:pointer;}",
    ].join("");
    doc.documentElement.appendChild(style);
  }
  const toast = doc.createElement("div");
  toast.id = "jsa-workday-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  const text = doc.createElement("div");
  text.textContent = message;
  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => toast.remove());
  toast.append(text, dismiss);
  doc.body?.append(toast);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitUntil(predicate: () => boolean, attempts = 8): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return true;
    await delay(attempt === 0 ? 0 : 20);
  }
  return predicate();
}

function placeholder(value: string): boolean {
  const norm = normalizeQuestionLabel(value);
  return !norm || /^(select one|select|choose one|choose|search)$/.test(norm);
}

export function optionElements(list: ParentNode): HTMLElement[] {
  return [...list.querySelectorAll("[role='option'], [data-automation-id='promptOption']")].filter(
    (element): element is HTMLElement => element instanceof HTMLElement && isShown(element)
  );
}

function listFromControls(button: HTMLElement): HTMLElement | null {
  const id = button.getAttribute("aria-controls");
  if (!id) return null;
  const controlled = button.ownerDocument.getElementById(id);
  if (!(controlled instanceof HTMLElement) || !isShown(controlled)) return null;
  if (controlled.getAttribute("role") === "listbox" || controlled.getAttribute("data-automation-id") === "activeListContainer") {
    return controlled;
  }
  const nested = controlled.querySelector("[role='listbox'], [data-automation-id='activeListContainer']");
  return nested instanceof HTMLElement && isShown(nested) ? nested : null;
}

function lastOpenList(doc: Document): HTMLElement | null {
  const lists = [...doc.querySelectorAll("[role='listbox'], [data-automation-id='activeListContainer']")].filter(
    (element): element is HTMLElement => element instanceof HTMLElement && isShown(element)
  );
  return lists.at(-1) ?? null;
}

function popupSearch(list: HTMLElement): HTMLInputElement | null {
  const host = list.closest("[data-automation-id='responsiveMonikerPrompt']");
  if (!host) return null;
  const input = host.querySelector(
    "[data-automation-id='searchBox'], input:not([type='hidden']):not([type='file']):not([type='checkbox']):not([type='radio'])"
  );
  return input instanceof HTMLInputElement && isShown(input) ? input : null;
}

function matchQuery(options: string[], queries: string[]): string | null {
  for (const query of queries) {
    const picked = chooseOption(options, query);
    if (picked) return picked;
  }
  return null;
}

export type WidgetResult = { ok: boolean; value: string; already: boolean; reason: string };

/**
 * Opens a Workday button listbox, types into its prompt when one is present,
 * and chooses the matching option. Does not press Enter.
 */
export async function chooseDropdown(button: HTMLElement, queries: string[]): Promise<WidgetResult> {
  const current = cleanText(button.textContent);
  if (!placeholder(current) && matchQuery([current], queries)) {
    return { ok: true, value: current, already: true, reason: "" };
  }
  if (!clickWorkdayControl(button)) {
    return { ok: false, value: "", already: false, reason: "Could not open the list" };
  }
  const opened = await waitUntil(() => Boolean(listFromControls(button) ?? lastOpenList(button.ownerDocument)));
  const list = listFromControls(button) ?? lastOpenList(button.ownerDocument);
  if (!opened || !list) {
    return { ok: false, value: "", already: false, reason: "List did not open" };
  }
  const search = popupSearch(list);
  if (search) {
    for (const query of queries) {
      if (!query.trim()) continue;
      setReactValue(search, query);
      await waitUntil(() => optionElements(list).some((option) => Boolean(chooseOption([cleanText(option.textContent)], query))));
      const picked = await chooseListedOption(list, [query]);
      if (picked.ok) return picked;
    }
  }
  const picked = await chooseListedOption(list, queries);
  if (picked.ok) return picked;
  button.ownerDocument.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return { ok: false, value: "", already: false, reason: "No matching option" };
}

async function chooseListedOption(list: HTMLElement, queries: string[]): Promise<WidgetResult> {
  const options = optionElements(list);
  const picked = matchQuery(options.map((option) => cleanText(option.textContent)).filter(Boolean), queries);
  if (!picked) return { ok: false, value: "", already: false, reason: "No matching option" };
  const target = options.find((option) => cleanText(option.textContent) === picked);
  if (!target || !clickWorkdayControl(target)) {
    return { ok: false, value: "", already: false, reason: "Could not choose the option" };
  }
  return { ok: true, value: picked, already: false, reason: "" };
}

function selectedTexts(root: ParentNode): string[] {
  return [...root.querySelectorAll("[data-automation-id='selectedItem'], [data-automation-id='selectedItemList'] li")]
    .map((element) => cleanText(element.textContent))
    .filter(Boolean);
}

function alreadySelected(root: ParentNode, value: string): boolean {
  const wanted = normalizeQuestionLabel(value);
  return selectedTexts(root).some((item) => normalizeQuestionLabel(item) === wanted);
}

/**
 * Types into a multiselect prompt, sends a synthetic Enter, and clicks the
 * result if Enter did not select it. The Enter event is not trusted, so the
 * browser will not submit the application form.
 */
export async function chooseMultiselect(doc: Document, input: HTMLInputElement, root: ParentNode, value: string): Promise<WidgetResult> {
  if (alreadySelected(root, value)) return { ok: true, value, already: true, reason: "" };
  setReactValue(input, value);
  await waitUntil(
    () =>
      alreadySelected(root, value) ||
      optionElements(doc).some((option) => Boolean(chooseOption([cleanText(option.textContent)], value)))
  );
  pressPromptEnter(input);
  const selected = await waitUntil(() => alreadySelected(root, value), 4);
  if (selected) {
    if (input.value) setReactValue(input, "");
    return { ok: true, value, already: false, reason: "" };
  }
  const options = optionElements(doc);
  const picked = matchQuery(options.map((option) => cleanText(option.textContent)).filter(Boolean), [value]);
  const target = picked ? options.find((option) => cleanText(option.textContent) === picked) : null;
  if (!target || !clickWorkdayControl(target)) {
    return { ok: false, value: "", already: false, reason: "No matching skill" };
  }
  await waitUntil(() => alreadySelected(root, value), 4);
  if (input.value) setReactValue(input, "");
  return alreadySelected(root, value) || picked
    ? { ok: true, value: picked || value, already: false, reason: "" }
    : { ok: false, value: "", already: false, reason: "Skill was not added" };
}

function pressPromptEnter(input: HTMLInputElement) {
  const init: KeyboardEventInit = { key: "Enter", code: "Enter", bubbles: true, cancelable: true };
  input.dispatchEvent(new KeyboardEvent("keydown", init));
  input.dispatchEvent(new KeyboardEvent("keyup", init));
}

export function writeSpinbutton(element: HTMLElement, value: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setReactValue(element, value);
    return;
  }
  element.textContent = value;
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) element.setAttribute("aria-valuenow", String(numeric));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

export function attachResumeFile(input: HTMLInputElement, file: { filename: string; bytes: number[] }): boolean {
  if (input.files && input.files.length > 0) return false;
  const blob = new File([Uint8Array.from(file.bytes)], file.filename, { type: "application/pdf" });
  try {
    const transfer = new DataTransfer();
    transfer.items.add(blob);
    assignFileList(input, transfer.files);
  } catch {
    try {
      Object.defineProperty(input, "files", { configurable: true, value: createFileList([blob]) });
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {
      return false;
    }
  }
  return Boolean(input.files && input.files.length > 0);
}

function createFileList(files: File[]): FileList {
  const list = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* iterator() {
      yield* files;
    },
  } as FileList;
  files.forEach((file, index) => {
    Object.defineProperty(list, index, { value: file });
  });
  return list;
}
