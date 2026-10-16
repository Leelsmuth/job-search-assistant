import type { PageField, PageSnapshot } from "@/modules/extension/page-types";

type Node = {
  name: string;
  attrs: Record<string, string>;
  contentStart: number;
  contentEnd: number;
  parent: number;
};

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCharCode(Number(digits)));
}

function cleanText(value: string): string {
  return decode(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const key = match[1].toLowerCase();
    if (key.startsWith("/") || key === "<") continue;
    attrs[key] = decode(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function parseNodes(html: string): Node[] {
  const nodes: Node[] = [];
  const stack: number[] = [];
  const pattern = /<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const name = match[1].toLowerCase();
    const closing = html[match.index + 1] === "/";
    const selfClosing = VOID.has(name) || /\/\s*$/.test(match[2]);
    if (closing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (nodes[stack[index]]?.name !== name) continue;
        const node = nodes[stack[index]];
        node.contentEnd = match.index;
        stack.splice(index);
        break;
      }
      continue;
    }
    const node: Node = {
      name,
      attrs: parseAttrs(match[2]),
      contentStart: match.index + match[0].length,
      contentEnd: match.index + match[0].length,
      parent: stack.length ? stack[stack.length - 1] : -1,
    };
    nodes.push(node);
    if (!selfClosing) stack.push(nodes.length - 1);
  }
  return nodes;
}

function textOf(html: string, node: Node): string {
  return cleanText(html.slice(node.contentStart, node.contentEnd));
}

function ancestor(nodes: Node[], index: number, name: string): Node | null {
  let parent = nodes[index]?.parent ?? -1;
  while (parent >= 0) {
    if (nodes[parent].name === name) return nodes[parent];
    parent = nodes[parent].parent;
  }
  return null;
}

function hasAttr(attrs: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(attrs, key);
}

function labelForId(nodes: Node[], html: string, id: string): string {
  if (!id) return "";
  for (const node of nodes) {
    if (node.name === "label" && node.attrs.for === id) return textOf(html, node);
  }
  return "";
}

function wrappingLabel(nodes: Node[], html: string, index: number): string {
  const label = ancestor(nodes, index, "label");
  return label ? textOf(html, label) : "";
}

function legend(nodes: Node[], html: string, index: number): string {
  const fieldset = ancestor(nodes, index, "fieldset");
  if (!fieldset) return "";
  if (fieldset.attrs["aria-label"]) return fieldset.attrs["aria-label"];
  const fieldsetIndex = nodes.indexOf(fieldset);
  for (let child = fieldsetIndex + 1; child < nodes.length; child += 1) {
    if (nodes[child].parent === fieldsetIndex && nodes[child].name === "legend") {
      return textOf(html, nodes[child]);
    }
  }
  return "";
}

function previousLabel(nodes: Node[], html: string, index: number): string {
  const parent = nodes[index].parent;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (nodes[cursor].parent !== parent) continue;
    if (nodes[cursor].name === "label" || nodes[cursor].name === "legend") {
      return textOf(html, nodes[cursor]);
    }
    break;
  }
  return "";
}

function controlLabel(nodes: Node[], html: string, index: number): string {
  const node = nodes[index];
  return (
    node.attrs["aria-label"] ||
    labelForId(nodes, html, node.attrs.id || "") ||
    wrappingLabel(nodes, html, index) ||
    previousLabel(nodes, html, index) ||
    node.attrs.placeholder ||
    ""
  );
}

function isRequired(attrs: Record<string, string>, label: string): boolean {
  if (hasAttr(attrs, "required") || attrs["aria-required"] === "true") return true;
  return /\*\s*$/.test(label) || label.includes("*");
}

function selectOptions(html: string, node: Node): Array<{ value: string; text: string }> {
  const inner = html.slice(node.contentStart, node.contentEnd);
  const options: Array<{ value: string; text: string }> = [];
  const pattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(inner))) {
    const attrs = parseAttrs(match[1]);
    const text = cleanText(match[2]);
    if (!text || /^select\b/i.test(text)) continue;
    options.push({ value: attrs.value || text, text });
  }
  return options;
}

function selectedText(options: Array<{ value: string; text: string }>, value: string): string {
  return options.find((option) => option.value === value)?.text ?? value;
}

export function extractFieldsFromHtml(source: string): PageSnapshot {
  const html = source
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const nodes = parseNodes(html);
  const headings: string[] = [];
  const buttons: string[] = [];
  const fields: PageField[] = [];
  const radioGroups = new Map<string, PageField>();

  nodes.forEach((node, index) => {
    if (node.name === "h1" || node.name === "h2" || node.name === "h3") {
      const text = textOf(html, node);
      if (text) headings.push(text);
      return;
    }
    if (node.name === "button") {
      const text = textOf(html, node);
      if (text) buttons.push(text);
      return;
    }
    if (node.name !== "input" && node.name !== "textarea" && node.name !== "select") return;
    if (hasAttr(node.attrs, "disabled")) return;
    const type = (node.attrs.type || (node.name === "select" ? "select" : node.name === "textarea" ? "textarea" : "text")).toLowerCase();
    if (["hidden", "submit", "button", "reset", "image", "password"].includes(type)) {
      if (type === "submit" || type === "button") {
        const text = node.attrs.value || node.attrs["aria-label"] || "";
        if (text) buttons.push(text);
      }
      return;
    }

    const label = controlLabel(nodes, html, index).replace(/\s*\*\s*/g, " ").replace(/\s+/g, " ").trim();
    const id = node.attrs.id || node.attrs["data-automation-id"] || "";
    const name = node.attrs.name || node.attrs["data-automation-id"] || "";
    const required = isRequired(node.attrs, controlLabel(nodes, html, index));

    if (type === "radio" || type === "checkbox") {
      const groupName = name || id || `choice-${fields.length}`;
      const optionText = label || node.attrs.value || groupName;
      const optionValue = node.attrs.value || optionText;
      const groupLabel = legend(nodes, html, index) || label;
      const existing = radioGroups.get(groupName);
      if (existing) {
        existing.options.push({ value: optionValue, text: optionText });
        existing.required = existing.required || required;
        if (node.attrs.checked !== undefined) existing.currentValue = optionValue;
        return;
      }
      const field: PageField = {
        key: groupName,
        name: groupName,
        id,
        tag: "input",
        type,
        label: legend(nodes, html, index) || groupLabel,
        required,
        options: [{ value: optionValue, text: optionText }],
        currentValue: node.attrs.checked !== undefined ? optionValue : "",
      };
      radioGroups.set(groupName, field);
      fields.push(field);
      return;
    }

    const options = node.name === "select" ? selectOptions(html, node) : [];
    const currentRaw = node.attrs.value || "";
    fields.push({
      key: id || name || `${node.name}-${index}`,
      name,
      id,
      tag: node.name === "select" ? "select" : node.name === "textarea" ? "textarea" : "input",
      type,
      label: legend(nodes, html, index) || label,
      required,
      options,
      currentValue: node.name === "select" ? selectedText(options, currentRaw) : currentRaw,
    });
  });

  return { fields, headings, buttons };
}
