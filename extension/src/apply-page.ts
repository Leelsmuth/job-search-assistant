import { assignFileList, setNativeChecked, setNativeValue } from "@/modules/extension/dom-value";
import type { FillInstruction } from "@/modules/extension/page-types";

export type ApplyFile = {
  role: "resume" | "coverLetter";
  filename: string;
  bytes: number[];
};

export type ApplyResult = {
  filled: Array<{ label: string; value: string }>;
  skipped: string[];
  attention: string[];
  blocked: boolean;
};

function walk(root: Document | ShadowRoot, visit: (element: Element) => void) {
  for (const element of root.querySelectorAll("*")) {
    visit(element);
    if (element.shadowRoot) walk(element.shadowRoot, visit);
  }
}

function elements(): Element[] {
  const found: Element[] = [];
  walk(document, (element) => found.push(element));
  return found;
}

function byKey(key: string, name: string): Element | null {
  for (const element of elements()) {
    if (key && (element.id === key || element.getAttribute("data-automation-id") === key)) return element;
  }
  if (!name) return null;
  for (const element of elements()) {
    if (element.getAttribute("name") === name) return element;
  }
  return null;
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

function checkedSetter() {
  return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
}

function currentText(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value.trim();
  }
  return "";
}

function highlight(element: Element) {
  element.classList.add("jsa-needs-attention");
}

function ensureStyle() {
  if (document.getElementById("jsa-attention-style")) return;
  const style = document.createElement("style");
  style.id = "jsa-attention-style";
  style.textContent =
    ".jsa-needs-attention{outline:2px solid #b45309 !important;outline-offset:2px;}";
  document.documentElement.appendChild(style);
}

function attach(input: HTMLInputElement, file: ApplyFile) {
  const blob = new File([new Uint8Array(file.bytes)], file.filename, { type: "application/pdf" });
  const transfer = new DataTransfer();
  transfer.items.add(blob);
  assignFileList(input, transfer.files);
}

/**
 * Writes values into the current page only.
 * This will not submit, click, or continue to another step.
 */
export function applyPlan(input: {
  reviewStep: boolean;
  fills: FillInstruction[];
  files: ApplyFile[];
  attentionKeys: string[];
}): ApplyResult {
  if (input.reviewStep) {
    return {
      filled: [],
      skipped: [],
      attention: ["This is the final review step. The extension will not submit or continue."],
      blocked: true,
    };
  }

  ensureStyle();
  const filled: ApplyResult["filled"] = [];
  const skipped: string[] = [];
  const attention: string[] = [];

  for (const fill of input.fills) {
    const element = byKey(fill.key, fill.name);
    if (!element) {
      attention.push(`${fill.label}: field not on this page`);
      continue;
    }
    if (fill.mode === "file") {
      if (!(element instanceof HTMLInputElement) || element.type !== "file") continue;
      if (element.files && element.files.length > 0) {
        skipped.push(fill.label);
        continue;
      }
      const file = input.files.find((item) => item.role === fill.fileRole);
      if (!file) {
        attention.push(`${fill.label}: file was not downloaded`);
        highlight(element);
        continue;
      }
      attach(element, file);
      filled.push({ label: fill.label, value: file.filename });
      continue;
    }
    if (fill.mode === "choice") {
      const choice = elements().find((candidate) => {
        return (
          candidate instanceof HTMLInputElement &&
          candidate.name === fill.name &&
          candidate.value === fill.value
        );
      });
      if (!(choice instanceof HTMLInputElement)) {
        attention.push(`${fill.label}: no matching choice`);
        continue;
      }
      const group = elements().filter(
        (candidate) => candidate instanceof HTMLInputElement && candidate.name === fill.name
      ) as HTMLInputElement[];
      if (group.some((candidate) => candidate.checked)) {
        skipped.push(fill.label);
        continue;
      }
      setNativeChecked(choice, true, checkedSetter());
      filled.push({ label: fill.label, value: fill.value });
      continue;
    }
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLSelectElement)
    ) {
      continue;
    }
    if (currentText(element)) {
      skipped.push(fill.label);
      continue;
    }
    setNativeValue(element, fill.value, valueSetter(element));
    filled.push({ label: fill.label, value: fill.value });
  }

  for (const key of input.attentionKeys) {
    const element = byKey(key, "");
    if (element) highlight(element);
  }

  return { filled, skipped, attention, blocked: false };
}
