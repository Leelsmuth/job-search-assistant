import { chooseOption, splitLegalName } from "@/modules/apply/map-questions";
import { mapFormQuestions } from "@/modules/apply/map-questions";
import { normalizeQuestionLabel } from "@/modules/apply/questions";
import type { FormQuestion, FormQuestionType } from "@/modules/apply/types";
import { expandProvince, prefersCanada } from "@/modules/extension/combobox";
import { detectWorkdayStep, workdayControlCount } from "@/modules/extension/workday/detect";
import { parseMonthYear } from "@/modules/extension/workday/history";
import type { WorkdayEducation, WorkdayExperience, WorkdayFillInput, WorkdayFillResult } from "@/modules/extension/workday/types";
import {
  WORKDAY_AUTH_MESSAGE,
  WORKDAY_REVIEW_MESSAGE,
  isQuestionStep,
  workdayStatusMessage,
} from "@/modules/extension/workday/types";
import {
  attachResumeFile,
  chooseDropdown,
  chooseMultiselect,
  cleanText,
  clickWorkdayControl,
  cssEscape,
  highlightField,
  isShown,
  setReactChecked,
  setReactValue,
  waitUntil,
  writeSpinbutton,
} from "@/modules/extension/workday/widgets";

type Bucket = {
  filled: WorkdayFillResult["filled"];
  skipped: string[];
  attention: WorkdayFillResult["attention"];
  experienceAdded: number;
  educationAdded: number;
  skillsAdded: string[];
};

function bucket(): Bucket {
  return { filled: [], skipped: [], attention: [], experienceAdded: 0, educationAdded: 0, skillsAdded: [] };
}

function labelText(value: string | null | undefined): string {
  return cleanText(value).replace(/\*/g, " ").replace(/\s+/g, " ").trim();
}

function fieldLabel(element: Element): string {
  const aria = labelText(element.getAttribute("aria-label"));
  if (aria) return aria;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => labelText(element.ownerDocument.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  if (element.id) {
    const match = element.ownerDocument.querySelector(`label[for="${cssEscape(element.id)}"]`);
    const text = labelText(match?.textContent);
    if (text) return text;
  }
  const container = element.closest("[data-automation-id^='formField'], fieldset, [role='group']") ?? element;
  const inside = container.querySelector("label, legend");
  return labelText(inside?.textContent);
}

function isRequired(element: Element): boolean {
  if (element.getAttribute("aria-required") === "true") return true;
  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) &&
    element.required
  ) {
    return true;
  }
  const container = element.closest("[data-automation-id^='formField']") ?? element.parentElement;
  if (!container) return false;
  if (container.querySelector("[aria-required='true'], [required]")) return true;
  return (container.querySelector("label, legend")?.textContent ?? "").includes("*");
}

function inRepeater(element: Element): boolean {
  return Boolean(
    element.closest("[data-automation-id='workExperienceSection'], [data-automation-id='educationSection']")
  );
}

function markHandled(handled: Set<Element>, element: Element) {
  handled.add(element);
  const field = element.closest("[data-automation-id^='formField']");
  if (field) handled.add(field);
}

function overlaps(element: Element, handled: Set<Element>): boolean {
  for (const item of handled) {
    if (item === element || item.contains(element) || element.contains(item)) return true;
  }
  return false;
}

function addAttention(target: Bucket, element: Element, label: string, reason: string) {
  highlightField(element);
  if (target.attention.some((item) => item.label === label && item.reason === reason)) return;
  target.attention.push({ label: label || "Required field", reason });
}

function noteFilled(target: Bucket, label: string, value: string) {
  target.filled.push({ label, value });
}

function dropdownButton(element: HTMLElement): HTMLElement | null {
  if (element.getAttribute("aria-haspopup") === "listbox") return element;
  const button = element.querySelector("[aria-haspopup='listbox']");
  return button instanceof HTMLElement ? button : null;
}

function textControl(element: HTMLElement): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  if (element instanceof HTMLInputElement) {
    if (["hidden", "file", "password", "checkbox", "radio", "submit", "button"].includes(element.type)) return null;
    return element;
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element;
  const inner = element.querySelector(
    "input:not([type='hidden']):not([type='file']):not([type='password']):not([type='checkbox']):not([type='radio']):not([type='submit']), textarea, select"
  );
  if (inner instanceof HTMLInputElement || inner instanceof HTMLTextAreaElement || inner instanceof HTMLSelectElement) return inner;
  return null;
}

function knownDropdownQueries(id: string, profile: WorkdayFillInput["profile"]): string[] | null {
  const key = id.toLowerCase();
  if (/device-type|devicetype/.test(key)) return ["Mobile", "Cell", "Mobile Phone"];
  if (/phone/.test(key) && /country|code/.test(key)) return prefersCanada(profile) ? ["Canada", "Canada (+1)", "+1"] : [];
  if (/countryregion|country-region|stateprovince|^region$/.test(key)) {
    const province = expandProvince(profile.province);
    return [province, profile.province].map((item) => item.trim()).filter(Boolean);
  }
  if (/countrydropdown|^country$|addresssection_country$/.test(key)) return prefersCanada(profile) ? ["Canada"] : [];
  if (/howdidyouhear|sourcedropdown|sourceprompt|hearabout/.test(key)) {
    return profile.howDidYouHear.trim() ? [profile.howDidYouHear.trim()] : [];
  }
  return null;
}

function knownTextValue(id: string, profile: WorkdayFillInput["profile"]): string | null {
  const key = id.toLowerCase();
  if (/password|username|userid/.test(key)) return null;
  if (/firstname|first_name|givenname/.test(key)) return splitLegalName(profile.legalName).first;
  if (/lastname|last_name|surname|familyname/.test(key)) return splitLegalName(profile.legalName).last;
  if (/addresssection_city|_city$|^city$/.test(key)) return profile.city;
  if (/phone-number$|phonenumber$|^phone$/.test(key)) return profile.phone;
  if (/^email$|emailaddress/.test(key)) return profile.email;
  if (/linkedin/.test(key)) return profile.linkedinUrl;
  if (/github/.test(key)) return profile.githubUrl;
  if (/portfolio|website/.test(key) && !/company/.test(key)) return profile.portfolioUrl;
  if (/postal|zip/.test(key)) return "";
  if (/addressline|address_line|^address$|addresssection_address/.test(key)) return "";
  if (/^region$|province|^state$/.test(key) && !/country/.test(key)) return expandProvince(profile.province);
  return null;
}

function contactValue(label: string, profile: WorkdayFillInput["profile"]): string | null {
  const text = normalizeQuestionLabel(label);
  if (!text) return null;
  if (/first name|given name/.test(text)) return splitLegalName(profile.legalName).first;
  if (/last name|surname|family name/.test(text)) return splitLegalName(profile.legalName).last;
  if (/^email$|email address/.test(text)) return profile.email;
  if (/phone/.test(text) && !/device|type|country|extension|code/.test(text)) return profile.phone;
  if (/^city$/.test(text)) return profile.city;
  if (/province|state|region/.test(text) && !/country/.test(text)) return expandProvince(profile.province);
  if (/linkedin/.test(text)) return profile.linkedinUrl;
  if (/github/.test(text)) return profile.githubUrl;
  if (/portfolio|personal website/.test(text)) return profile.portfolioUrl;
  if (/how did you hear|referral source/.test(text)) return profile.howDidYouHear;
  if (/postal|zip code|zipcode/.test(text)) return "";
  if (/address line|street address/.test(text)) return "";
  return null;
}

async function writeTextLike(
  element: HTMLElement,
  value: string,
  label: string,
  target: Bucket,
  handled: Set<Element>
): Promise<void> {
  const dropdown = dropdownButton(element);
  if (dropdown) {
    const result = await chooseDropdown(dropdown, [value]);
    markHandled(handled, dropdown);
    if (result.already) {
      target.skipped.push(label);
      return;
    }
    if (!result.ok) {
      addAttention(target, dropdown, label, result.reason);
      return;
    }
    noteFilled(target, label, result.value);
    return;
  }
  const control = textControl(element);
  if (!control || control.disabled) return;
  markHandled(handled, control);
  if (control.value.trim()) {
    target.skipped.push(label);
    return;
  }
  if (control instanceof HTMLSelectElement) {
    const picked = chooseOption(
      [...control.options].map((option) => option.text),
      value
    );
    const option = [...control.options].find((item) => item.text === picked);
    if (!option) {
      if (isRequired(control)) addAttention(target, control, label, "No matching option");
      return;
    }
    setReactValue(control, option.value);
    noteFilled(target, label, option.text.trim());
    return;
  }
  setReactValue(control, value);
  noteFilled(target, label, value);
}

async function fillKnownFields(doc: Document, input: WorkdayFillInput, handled: Set<Element>, target: Bucket) {
  const nodes = [...doc.querySelectorAll("[data-automation-id]")].filter(
    (element): element is HTMLElement => element instanceof HTMLElement && isShown(element) && !inRepeater(element)
  );
  for (const node of nodes) {
    if (overlaps(node, handled)) continue;
    const id = node.getAttribute("data-automation-id") ?? "";
    const dropdownQueries = knownDropdownQueries(id, input.profile);
    const button = dropdownButton(node);
    if (dropdownQueries && button && button === node) {
      const label = fieldLabel(button) || id;
      if (!dropdownQueries.length) {
        if (isRequired(button)) addAttention(target, button, label, "Required field was not filled.");
        markHandled(handled, button);
        continue;
      }
      const result = await chooseDropdown(button, dropdownQueries);
      markHandled(handled, button);
      if (result.already) target.skipped.push(label);
      else if (!result.ok) addAttention(target, button, label, result.reason);
      else noteFilled(target, label, result.value);
      continue;
    }
    const text = knownTextValue(id, input.profile);
    const direct = textControl(node);
    if (text === null || !direct || direct !== node) continue;
    const label = fieldLabel(direct) || id;
    if (!text.trim()) {
      if (isRequired(direct)) addAttention(target, direct, label, "Required field was not filled.");
      markHandled(handled, direct);
      continue;
    }
    await writeTextLike(direct, text, label, target, handled);
  }

  for (const element of doc.querySelectorAll("input, textarea, select")) {
    if (!(element instanceof HTMLElement) || !isShown(element) || overlaps(element, handled) || inRepeater(element)) continue;
    if (element instanceof HTMLInputElement && ["hidden", "file", "password", "checkbox", "radio", "submit", "button"].includes(element.type)) {
      continue;
    }
    const label = fieldLabel(element);
    const value = contactValue(label, input.profile);
    if (value === null) continue;
    if (!value.trim()) {
      if (isRequired(element)) addAttention(target, element, label, "Required field was not filled.");
      markHandled(handled, element);
      continue;
    }
    await writeTextLike(element, value, label, target, handled);
  }
}

function choiceNodes(root: ParentNode, kind: "radio" | "checkbox"): HTMLElement[] {
  const selector = kind === "radio" ? "[role='radio'], input[type='radio']" : "[role='checkbox'], input[type='checkbox']";
  return [...root.querySelectorAll(selector)].filter((element): element is HTMLElement => element instanceof HTMLElement && isShown(element));
}

function choiceLabel(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    const wrap = element.closest("label");
    if (wrap) return labelText(wrap.textContent);
    if (element.id) {
      const match = element.ownerDocument.querySelector(`label[for="${cssEscape(element.id)}"]`);
      const text = labelText(match?.textContent);
      if (text) return text;
    }
    return labelText(element.value);
  }
  return labelText(element.textContent) || labelText(element.getAttribute("aria-label"));
}

function choiceSelected(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) return element.checked;
  return element.getAttribute("aria-checked") === "true";
}

function selectChoice(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    if (element.checked) return false;
    setReactChecked(element, true);
    return true;
  }
  if (!clickWorkdayControl(element)) return false;
  const group = element.closest("[role='radiogroup'], [role='group']") ?? element.parentElement;
  if (element.getAttribute("role") === "radio" && group) {
    for (const item of group.querySelectorAll("[role='radio']")) item.setAttribute("aria-checked", item === element ? "true" : "false");
  } else if (element.getAttribute("role") === "checkbox") {
    element.setAttribute("aria-checked", "true");
  }
  return true;
}

function questionFields(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll("[data-automation-id^='formField-']")].filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || !isShown(element)) return false;
    if (element.closest("[data-automation-id='progressBar'], #jsa-workday-toast")) return false;
    if (inRepeater(element)) return false;
    if (element.querySelector("[data-automation-id^='formField-']")) return false;
    return true;
  });
}

function questionType(root: HTMLElement): FormQuestionType {
  if (root.querySelector("[data-automation-id='multiselectInputContainer']")) return "multi_select";
  if (root.querySelector("[data-automation-id='dateSectionMonth-input'], [role='spinbutton']")) return "date";
  if (root.querySelector("input[type='file']")) return "file";
  if (root.querySelector("textarea")) return "long_text";
  if (choiceNodes(root, "radio").length >= 2 || choiceNodes(root, "checkbox").length >= 2) return "select";
  if (root.querySelector("input[type='email']")) return "email";
  if (root.querySelector("input[type='tel']")) return "phone";
  return "short_text";
}

function questionOptions(root: HTMLElement): string[] {
  const choices = [...choiceNodes(root, "radio"), ...choiceNodes(root, "checkbox")];
  if (choices.length) return choices.map(choiceLabel).filter(Boolean);
  const select = root.querySelector("select");
  if (select instanceof HTMLSelectElement) return [...select.options].map((option) => option.text.trim()).filter(Boolean);
  return [];
}

async function applyQuestionAnswer(doc: Document, root: HTMLElement, answer: string, label: string, target: Bucket, handled: Set<Element>) {
  const radios = choiceNodes(root, "radio");
  const checks = choiceNodes(root, "checkbox");
  const choices = radios.length ? radios : checks.length > 1 ? checks : [];
  if (choices.length) {
    const picked = chooseOption(choices.map(choiceLabel), answer);
    const match = choices.find((choice) => choiceLabel(choice) === picked);
    if (!match) {
      addAttention(target, root, label, "No matching option");
      markHandled(handled, root);
      return;
    }
    if (choiceSelected(match)) {
      target.skipped.push(label);
      markHandled(handled, root);
      return;
    }
    if (!selectChoice(match)) {
      addAttention(target, root, label, "Could not choose the option");
      markHandled(handled, root);
      return;
    }
    noteFilled(target, label, choiceLabel(match));
    markHandled(handled, root);
    return;
  }
  const single = checks.length === 1 ? checks[0] : null;
  if (single && /^(yes|true)$/i.test(answer)) {
    if (choiceSelected(single)) target.skipped.push(label);
    else if (selectChoice(single)) noteFilled(target, label, answer);
    else addAttention(target, root, label, "Could not choose the option");
    markHandled(handled, root);
    return;
  }
  const button = dropdownButton(root);
  if (button) {
    const result = await chooseDropdown(button, [answer]);
    markHandled(handled, root);
    if (result.already) target.skipped.push(label);
    else if (!result.ok) addAttention(target, button, label, result.reason);
    else noteFilled(target, label, result.value);
    return;
  }
  const spins = [...root.querySelectorAll("[role='spinbutton'], [data-automation-id='dateSectionMonth-input'], [data-automation-id='dateSectionYear-input']")].filter(
    (element): element is HTMLElement => element instanceof HTMLElement
  );
  if (spins.length) {
    const parsed = parseMonthYear(answer);
    if (!parsed) {
      addAttention(target, root, label, "Required field was not filled.");
      markHandled(handled, root);
      return;
    }
    writeDateBox(root, parsed.month, parsed.year, label, target);
    markHandled(handled, root);
    return;
  }
  const file = root.querySelector("input[type='file']");
  if (file instanceof HTMLInputElement) {
    markHandled(handled, root);
    return;
  }
  const control = textControl(root);
  if (!control) {
    addAttention(target, root, label, "Field not on this page");
    markHandled(handled, root);
    return;
  }
  await writeTextLike(control, answer, label, target, handled);
}

async function fillQuestions(doc: Document, input: WorkdayFillInput, handled: Set<Element>, target: Bucket, highlightOptional: boolean) {
  const fields = questionFields(doc).filter((field) => !overlaps(field, handled));
  if (!fields.length) return;
  const questions: FormQuestion[] = fields.map((field) => ({
    id: field.getAttribute("data-automation-id") || fieldLabel(field),
    label: fieldLabel(field),
    type: questionType(field),
    required: isRequired(field),
    options: questionOptions(field),
  }));
  const mapped = mapFormQuestions({
    questions,
    profile: input.profile,
    coverLetterBody: input.coverLetterBody ?? null,
    existingAnswers: input.preparedAnswers.map((item) => ({
      question: item.label,
      draftAnswer: item.answer,
      finalAnswer: item.answer,
      evidenceIds: [],
      unsupportedClaims: [],
    })),
  });
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const plan = mapped[index];
    const label = plan?.label || fieldLabel(field);
    if (!label) continue;
    const answer = plan?.answer.trim() ?? "";
    if (!answer || plan?.kind === "file") {
      const required = plan?.required || isRequired(field);
      if (plan?.kind === "file") {
        markHandled(handled, field);
        if (required) addAttention(target, field, label, "Attach this file yourself.");
        continue;
      }
      if (highlightOptional || required) {
        const reason =
          plan?.kind === "unmapped" || plan?.kind === "open_ended"
            ? "Left blank. No saved answer for this question."
            : "Required field was not filled.";
        addAttention(target, field, label, reason);
      }
      markHandled(handled, field);
      continue;
    }
    await applyQuestionAnswer(doc, field, answer, label, target, handled);
  }
}

function findControl(panel: ParentNode, ids: string[], label: RegExp): HTMLElement | null {
  for (const id of ids) {
    const found = panel.querySelector(`[data-automation-id="${cssEscape(id)}"]`);
    if (found instanceof HTMLElement) return found;
  }
  for (const candidate of panel.querySelectorAll("label, legend")) {
    const text = labelText(candidate.textContent);
    if (!label.test(text)) continue;
    const html = candidate instanceof HTMLElement ? candidate : null;
    const forId = html?.getAttribute("for");
    if (forId) {
      const target = candidate.ownerDocument.getElementById(forId);
      if (target instanceof HTMLElement && panel.contains(target)) return target;
    }
    const container = candidate.closest("[data-automation-id^='formField']") ?? candidate.parentElement;
    const control = container?.querySelector("input, textarea, select, button, [role='spinbutton']");
    if (control instanceof HTMLElement && panel.contains(control)) return control;
  }
  return null;
}

function writeDateBox(box: ParentNode, month: string, year: string, label: string, target: Bucket) {
  const monthEl =
    box.querySelector("[data-automation-id='dateSectionMonth-input']") ??
    [...box.querySelectorAll("[role='spinbutton'], input")].find((element) => /month/i.test(element.getAttribute("aria-label") ?? ""));
  const yearEl =
    box.querySelector("[data-automation-id='dateSectionYear-input']") ??
    [...box.querySelectorAll("[role='spinbutton'], input")].find((element) => /year/i.test(element.getAttribute("aria-label") ?? ""));
  if (!(monthEl instanceof HTMLElement) || !(yearEl instanceof HTMLElement)) {
    addAttention(target, monthEl instanceof HTMLElement ? monthEl : yearEl instanceof HTMLElement ? yearEl : (box as Element), label, "Field not on this page");
    return;
  }
  const monthValue = monthEl instanceof HTMLInputElement ? monthEl.value.trim() : cleanText(monthEl.textContent);
  const yearValue = yearEl instanceof HTMLInputElement ? yearEl.value.trim() : cleanText(yearEl.textContent);
  if (monthValue || yearValue) {
    target.skipped.push(label);
    return;
  }
  writeSpinbutton(monthEl, month);
  writeSpinbutton(yearEl, year);
  noteFilled(target, label, `${month}/${year}`);
}

async function fillDates(panel: HTMLElement, ids: string[], label: RegExp, name: string, month: string, year: string, target: Bucket, handled: Set<Element>) {
  const found = findControl(panel, ids, label);
  if (!found) return;
  const box = (found.closest("[data-automation-id^='formField']") as HTMLElement | null) ?? found;
  writeDateBox(box, month, year, name, target);
  markHandled(handled, box);
}

function findCheckbox(panel: HTMLElement): HTMLElement | null {
  const named = panel.querySelector("[data-automation-id='currentlyWorkHere']");
  if (named instanceof HTMLInputElement) return named;
  if (named instanceof HTMLElement) {
    const input = named.querySelector("input[type='checkbox']");
    if (input instanceof HTMLInputElement) return input;
    return named;
  }
  for (const label of panel.querySelectorAll("label")) {
    if (!/currently work|i currently|present employer/i.test(label.textContent ?? "")) continue;
    const input = label.querySelector("input[type='checkbox'], [role='checkbox']");
    if (input instanceof HTMLElement) return input;
  }
  return null;
}

async function fillExperiencePanel(doc: Document, panel: HTMLElement, entry: WorkdayExperience, target: Bucket, handled: Set<Element>) {
  await writeLabeled(doc, panel, ["jobTitle", "title"], /job title|^title$|position/i, entry.title, "Job title", target, handled);
  await writeLabeled(doc, panel, ["company", "companyName"], /company/i, entry.company, "Company", target, handled);
  await writeLabeled(doc, panel, ["location"], /^location$|city/i, entry.location, "Location", target, handled);
  const current = findCheckbox(panel);
  if (current && entry.current) {
    if (current instanceof HTMLInputElement && current.type === "checkbox") {
      if (!current.checked) {
        setReactChecked(current, true);
        noteFilled(target, "Currently work here", "Yes");
      } else target.skipped.push("Currently work here");
    } else if (current.getAttribute("aria-checked") !== "true" && clickWorkdayControl(current)) {
      current.setAttribute("aria-checked", "true");
      noteFilled(target, "Currently work here", "Yes");
    }
    markHandled(handled, current);
  }
  const start = parseMonthYear(entry.startDate);
  if (start) await fillDates(panel, ["formField-startDate", "startDate"], /^from$|start date|^start$/i, "Start date", start.month, start.year, target, handled);
  const endBox = findControl(panel, ["formField-endDate", "endDate"], /^to$|end date|^end$/i);
  if (entry.current && endBox) markHandled(handled, endBox);
  if (!entry.current) {
    const end = parseMonthYear(entry.endDate);
    if (end) await fillDates(panel, ["formField-endDate", "endDate"], /^to$|end date|^end$/i, "End date", end.month, end.year, target, handled);
  }
  await writeLabeled(doc, panel, ["roleDescription", "description"], /description|summary/i, entry.description, "Description", target, handled);
}

async function fillEducationPanel(doc: Document, panel: HTMLElement, entry: WorkdayEducation, target: Bucket, handled: Set<Element>) {
  await writeLabeled(doc, panel, ["school", "schoolName"], /school|university|institution/i, entry.school, "School", target, handled);
  await writeLabeled(doc, panel, ["degree"], /^degree$|degree/i, entry.degree, "Degree", target, handled);
  await writeLabeled(doc, panel, ["location"], /^location$/i, entry.location, "School location", target, handled);
  await writeLabeled(doc, panel, ["fieldOfStudy", "fieldOfStudy"], /field of study|major|area of study/i, entry.field, "Field of study", target, handled);
  const start = parseMonthYear(entry.startDate);
  if (start) await fillDates(panel, ["formField-startDate", "startDate"], /^from$|start date|^start$/i, "Start date", start.month, start.year, target, handled);
  const end = parseMonthYear(entry.endDate);
  if (end) await fillDates(panel, ["formField-endDate", "endDate"], /^to$|end date|^end$/i, "End date", end.month, end.year, target, handled);
}

async function writeLabeled(
  doc: Document,
  panel: HTMLElement,
  ids: string[],
  label: RegExp,
  value: string,
  name: string,
  target: Bucket,
  handled: Set<Element>
) {
  if (!value.trim()) return;
  const found = findControl(panel, ids, label);
  if (!found) {
    addAttention(target, panel, name, "Field not on this page");
    return;
  }
  await writeTextLike(found, value, name, target, handled);
}

function repeaterPanels(section: HTMLElement, prefix: string): HTMLElement[] {
  return [...section.querySelectorAll(`[data-automation-id^="${prefix}"]`)].filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || !isShown(element) || element === section) return false;
    return !element.querySelector(`[data-automation-id^="${prefix}"]`);
  });
}

function findAddButton(section: HTMLElement): HTMLButtonElement | null {
  const named = section.querySelector("[data-automation-id='add-button']");
  if (named instanceof HTMLButtonElement && isShown(named)) return named;
  if (named instanceof HTMLElement) {
    const button = named.querySelector("button");
    if (button instanceof HTMLButtonElement && isShown(button)) return button;
  }
  const text = [...section.querySelectorAll("button")].find(
    (button): button is HTMLButtonElement =>
      button instanceof HTMLButtonElement && isShown(button) && /^add\b/i.test(cleanText(button.textContent))
  );
  return text ?? null;
}

async function growRepeater(section: HTMLElement, prefix: string, count: number, target: Bucket, key: "experienceAdded" | "educationAdded") {
  let guard = 0;
  while (repeaterPanels(section, prefix).length < count && guard < count + 1) {
    guard += 1;
    const before = repeaterPanels(section, prefix).length;
    const button = findAddButton(section);
    if (!button || !clickWorkdayControl(button)) break;
    const grew = await waitUntil(() => repeaterPanels(section, prefix).length > before);
    if (!grew) break;
    target[key] += 1;
  }
}

async function fillRepeaters(doc: Document, input: WorkdayFillInput, handled: Set<Element>, target: Bucket) {
  const experience = doc.querySelector("[data-automation-id='workExperienceSection']");
  if (experience instanceof HTMLElement && isShown(experience)) {
    await growRepeater(experience, "workExperience-", input.history.experiences.length, target, "experienceAdded");
    const panels = repeaterPanels(experience, "workExperience-");
    for (let index = 0; index < Math.min(panels.length, input.history.experiences.length); index += 1) {
      await fillExperiencePanel(doc, panels[index], input.history.experiences[index], target, handled);
    }
  }
  const education = doc.querySelector("[data-automation-id='educationSection']");
  if (education instanceof HTMLElement && isShown(education)) {
    await growRepeater(education, "education-", input.history.education.length, target, "educationAdded");
    const panels = repeaterPanels(education, "education-");
    for (let index = 0; index < Math.min(panels.length, input.history.education.length); index += 1) {
      await fillEducationPanel(doc, panels[index], input.history.education[index], target, handled);
    }
  }
}

function skillsRoots(doc: Document): HTMLElement[] {
  const roots: HTMLElement[] = [];
  for (const element of doc.querySelectorAll("[data-automation-id]")) {
    if (!(element instanceof HTMLElement) || !isShown(element) || inRepeater(element)) continue;
    const id = element.getAttribute("data-automation-id") ?? "";
    const skillish = /skill/i.test(id) || /skill/i.test(fieldLabel(element));
    if (!skillish) continue;
    if (id !== "multiselectInputContainer" && !element.querySelector("[data-automation-id='multiselectInputContainer']") && !element.querySelector("input")) {
      continue;
    }
    const root =
      (element.closest("[data-automation-id^='formField']") as HTMLElement | null) ??
      (element.closest("[data-automation-id='multiselectInputContainer']") as HTMLElement | null) ??
      element;
    if (!roots.includes(root)) roots.push(root);
  }
  return roots;
}

async function fillSkills(doc: Document, input: WorkdayFillInput, handled: Set<Element>, target: Bucket) {
  const skills = input.history.skills.slice(0, 20);
  if (!skills.length) return;
  for (const root of skillsRoots(doc)) {
    const inputEl =
      root.querySelector("[data-automation-id='multiselectInputContainer'] input") ??
      root.querySelector("input[data-automation-id='searchBox']") ??
      root.querySelector("input:not([type='hidden']):not([type='file'])");
    if (!(inputEl instanceof HTMLInputElement)) continue;
    markHandled(handled, root);
    for (const skill of skills) {
      const result = await chooseMultiselect(doc, inputEl, root, skill);
      if (result.already) continue;
      if (!result.ok) {
        addAttention(target, root, "Skills", result.reason);
        break;
      }
      target.skillsAdded.push(result.value);
      noteFilled(target, "Skills", result.value);
    }
  }
}

function resumeInput(doc: Document): HTMLInputElement | null {
  const inputs = [...doc.querySelectorAll("input[type='file']")].filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement && isShown(element)
  );
  const labeled = inputs.find((input) =>
    /resume|cv|file-upload/i.test(`${fieldLabel(input)} ${input.id} ${input.getAttribute("data-automation-id") ?? ""}`)
  );
  return labeled ?? (inputs.length === 1 ? inputs[0] : null);
}

function fillResume(doc: Document, input: WorkdayFillInput, handled: Set<Element>, target: Bucket) {
  const file = resumeInput(doc);
  if (!file) return;
  markHandled(handled, file);
  if (!input.resume?.bytes.length) return;
  if (file.files && file.files.length > 0) {
    target.skipped.push("Resume");
    return;
  }
  if (!attachResumeFile(file, input.resume)) {
    addAttention(target, file, "Resume", "Resume could not be attached.");
    return;
  }
  noteFilled(target, "Resume", input.resume.filename);
}

function highlightLeftovers(doc: Document, handled: Set<Element>, target: Bucket) {
  for (const element of doc.querySelectorAll("input, textarea, select")) {
    if (!(element instanceof HTMLElement) || !isShown(element) || overlaps(element, handled)) continue;
    if (element.closest("[data-automation-id='progressBar'], #jsa-workday-toast")) continue;
    if (element instanceof HTMLInputElement && ["hidden", "file", "password", "submit", "button"].includes(element.type)) continue;
    if (!isRequired(element)) continue;
    const current = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
      ? element.value.trim()
      : "";
    if (current) continue;
    if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox") && element.checked) continue;
    addAttention(target, element, fieldLabel(element) || "Required field", "Required field was not filled.");
    markHandled(handled, element);
  }
}

/**
 * Fills the Workday step currently in the document.
 * Never clicks Next, Save and Continue, Submit, or account/password controls.
 */
export async function fillWorkdayStep(doc: Document, input: WorkdayFillInput): Promise<WorkdayFillResult> {
  const step = detectWorkdayStep(doc);
  const target = bucket();
  const blocked = step.id === "review" || step.id === "signIn" || step.id === "createAccount";
  if (!blocked) {
    const handled = new Set<Element>();
    await fillKnownFields(doc, input, handled, target);
    if (step.id === "myExperience") {
      fillResume(doc, input, handled, target);
      await fillRepeaters(doc, input, handled, target);
      await fillSkills(doc, input, handled, target);
    }
    if (step.id !== "unknown") {
      await fillQuestions(doc, input, handled, target, isQuestionStep(step.id));
    }
    highlightLeftovers(doc, handled, target);
  }
  return {
    step,
    blocked,
    message: blocked
      ? step.id === "review"
        ? WORKDAY_REVIEW_MESSAGE
        : WORKDAY_AUTH_MESSAGE
      : workdayStatusMessage(step.title, target.attention.length),
    filled: target.filled,
    skipped: target.skipped,
    attention: target.attention,
    experienceAdded: target.experienceAdded,
    educationAdded: target.educationAdded,
    skillsAdded: target.skillsAdded,
    controlCount: workdayControlCount(doc),
  };
}
