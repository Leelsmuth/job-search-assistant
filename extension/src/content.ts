import { applyPlan, type ApplyFile } from "./apply-page";
import { fillWorkdayFromMessage, startWorkdayAssistant } from "./workday-runtime";
import { isComboboxControl } from "@/modules/extension/combobox";
import { detectWorkdayStep } from "@/modules/extension/workday/detect";
import { extractJobPosting } from "@/modules/extension/posting";
import type { PageField } from "@/modules/extension/page-types";
import { detectPageProvider } from "@/modules/extension/urls";
import type { FillInstruction } from "@/modules/extension/page-types";

const FLAG = "__jobSearchAssistantContent";

function walk(root: Document | ShadowRoot, visit: (element: Element) => void) {
  for (const element of root.querySelectorAll("*")) {
    visit(element);
    if (element.shadowRoot) walk(element.shadowRoot, visit);
  }
}

function text(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function referenced(ids: string | null): string {
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => {
      if (!id || /-error$|-help$/.test(id)) return "";
      return text(document.getElementById(id));
    })
    .filter(Boolean)
    .join(" ");
}

function groupOf(element: Element): string {
  const legend = element.closest("fieldset")?.querySelector("legend");
  if (text(legend)) return text(legend).replace(/\s*\*\s*/g, " ").trim();
  const group = element.closest("[role='group'][aria-labelledby]");
  return referenced(group?.getAttribute("aria-labelledby") ?? "").replace(/\s*\*\s*/g, " ").trim();
}

function displayLabel(label: string, group: string): string {
  if (/^(attach|upload|choose file|browse)$/i.test(label.trim()) && group) return group;
  return label;
}

function labelFor(element: Element): string {
  const aria = element.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  const labelled = referenced(element.getAttribute("aria-labelledby"));
  if (labelled) return labelled;
  const id = element.getAttribute("id");
  if (id) {
    const escaped = CSS.escape(id);
    const match = document.querySelector(`label[for="${escaped}"]`);
    if (text(match)) return text(match);
  }
  const wrap = element.closest("label");
  if (text(wrap)) return text(wrap);
  const legend = element.closest("fieldset")?.querySelector("legend");
  if (text(legend) && (element.getAttribute("type") === "radio" || element.getAttribute("type") === "checkbox")) {
    return text(legend);
  }
  const previous = element.parentElement?.querySelector("label, legend");
  if (text(previous)) return text(previous);
  return element.getAttribute("placeholder")?.trim() ?? "";
}

function optionLabel(element: HTMLInputElement): string {
  const wrap = element.closest("label");
  if (text(wrap)) return text(wrap);
  if (element.id) {
    const escaped = CSS.escape(element.id);
    const match = document.querySelector(`label[for="${escaped}"]`);
    if (text(match)) return text(match);
  }
  return element.value;
}

function collectFields(): PageField[] {
  const fields: PageField[] = [];
  const groups = new Map<string, PageField>();
  walk(document, (element) => {
    if (element instanceof HTMLButtonElement && element.classList.contains("iti__selected-country")) {
      const group = "Phone";
      fields.push({
        key: element.id || "phone-country",
        name: element.getAttribute("name") || "",
        id: element.id,
        tag: "button",
        type: "combobox",
        label: "Country",
        required: true,
        options: [],
        currentValue: (element.getAttribute("title") || "").trim(),
        control: "combobox",
        groupLabel: group,
        description: "",
      });
      return;
    }
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
      return;
    }
    if (element.disabled || element.getAttribute("aria-hidden") === "true") return;
    const combobox = isComboboxControl({
      role: element.getAttribute("role") ?? "",
      ariaAutocomplete: element.getAttribute("aria-autocomplete") ?? "",
      className: element.className,
    });
    const type = combobox
      ? "combobox"
      : (element instanceof HTMLInputElement ? element.type : element instanceof HTMLSelectElement ? "select" : "textarea").toLowerCase();
    if (["hidden", "submit", "button", "reset", "image", "password"].includes(type)) return;
    const name = element.getAttribute("name") || element.getAttribute("data-automation-id") || "";
    const id = element.id || element.getAttribute("data-automation-id") || "";
    const required = element.required || element.getAttribute("aria-required") === "true";
    const grouped = groupOf(element);
    const description = referenced(element.getAttribute("aria-describedby"));
    if (type === "radio" || type === "checkbox") {
      const input = element as HTMLInputElement;
      const key = name || id;
      if (!key) return;
      const existing = groups.get(key);
      const option = { value: input.value, text: optionLabel(input) };
      if (existing) {
        existing.options.push(option);
        existing.required = existing.required || required;
        if (input.checked) existing.currentValue = input.value;
        return;
      }
      const field: PageField = {
        key,
        name: key,
        id,
        tag: "input",
        type,
        label: labelFor(input),
        required,
        options: [option],
        currentValue: input.checked ? input.value : "",
        groupLabel: grouped,
        description,
      };
      groups.set(key, field);
      fields.push(field);
      return;
    }
    const options =
      element instanceof HTMLSelectElement
        ? [...element.options]
            .filter((option) => option.value && !/^select\b/i.test(option.text))
            .map((option) => ({ value: option.value, text: option.text.trim() }))
        : [];
    fields.push({
      key: id || name || `${type}-${fields.length}`,
      name,
      id,
      tag: element instanceof HTMLSelectElement ? "select" : element instanceof HTMLTextAreaElement ? "textarea" : "input",
      type,
      label: displayLabel(labelFor(element).replace(/\s*\*\s*/g, " ").trim(), grouped),
      required,
      options,
      currentValue: combobox ? comboboxValue(element) || element.value.trim() : element.value.trim(),
      control: combobox ? "combobox" : undefined,
      groupLabel: grouped,
      description,
    });
  });
  return fields;
}

function comboboxValue(element: Element): string {
  const container = element.closest(".select, .iti");
  const single = container?.querySelector(".select__single-value, [class*='single-value'], [class*='singleValue']");
  return text(single);
}

function headings(): string[] {
  const found: string[] = [];
  walk(document, (element) => {
    if (element.tagName === "H1" || element.tagName === "H2" || element.tagName === "H3") {
      const value = text(element);
      if (value) found.push(value);
    }
  });
  return found;
}

function buttons(): string[] {
  const found: string[] = [];
  walk(document, (element) => {
    if (element instanceof HTMLButtonElement) {
      const value = text(element);
      if (value) found.push(value);
    }
    if (element instanceof HTMLInputElement && (element.type === "submit" || element.type === "button") && element.value) {
      found.push(element.value);
    }
  });
  return found;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function postingSource(): string {
  const chunks: string[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => chunks.push(node.outerHTML));
  document.querySelectorAll("meta").forEach((node) => {
    const key = node.getAttribute("property") || node.getAttribute("name") || "";
    if (/title|description|site_name|location/i.test(key)) chunks.push(node.outerHTML);
  });
  const title = document.querySelector("title")?.textContent ?? "";
  const heading = document.querySelector("h1")?.textContent ?? "";
  chunks.push(`<title>${escapeAttr(title)}</title>`);
  chunks.push(`<h1>${escapeAttr(heading)}</h1>`);
  const company = [
    ".job-details-jobs-unified-top-card__company-name",
    "[data-testid='inlineHeader-companyName']",
    ".jobsearch-CompanyInfoContainer a",
    "[data-company-name]",
  ]
    .map((selector) => document.querySelector(selector)?.textContent?.trim() ?? "")
    .find(Boolean);
  if (company) chunks.push(`<meta property="og:site_name" content="${escapeAttr(company)}" />`);
  const location = [".job-details-jobs-unified-top-card__bullet", "[data-testid='job-location']", ".jobsearch-JobInfoHeader-subtitle"]
    .map((selector) => document.querySelector(selector)?.textContent?.trim() ?? "")
    .find(Boolean);
  if (location) chunks.push(`<meta name="job:location" content="${escapeAttr(location)}" />`);
  return chunks.join("\n");
}

function collectPage() {
  const provider = detectPageProvider(location.href);
  return {
    url: location.href,
    provider,
    headings: headings(),
    buttons: buttons(),
    fields: collectFields(),
    posting: extractJobPosting(postingSource(), location.href),
    workdayStep: provider === "workday" ? detectWorkdayStep(document) : null,
  };
}

function boot() {
  const host = globalThis as typeof globalThis & Record<string, unknown>;
  if (host[FLAG]) return;
  host[FLAG] = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "collect") {
      sendResponse(collectPage());
      return false;
    }
    if (message?.type === "apply-tab" || message?.type === "apply") {
      void applyPlan({
        reviewStep: Boolean(message.reviewStep),
        fills: (message.fills ?? []) as FillInstruction[],
        files: (message.files ?? []) as ApplyFile[],
        attentionKeys: (message.attentionKeys ?? []) as string[],
      }).then(sendResponse);
      return true;
    }
    if (message?.type === "workday-fill") {
      void fillWorkdayFromMessage(message).then(sendResponse);
      return true;
    }
    return false;
  });
  if (detectPageProvider(location.href) === "workday") startWorkdayAssistant();
}

boot();
