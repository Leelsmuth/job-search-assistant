import type { ApplyProvider, FormQuestion, FormQuestionType } from "./types";

const QUESTION_TYPES = new Set<FormQuestionType>([
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "boolean",
  "select",
  "multi_select",
  "date",
  "file",
  "number",
]);

export function normalizeQuestionLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slug(value: string): string {
  const normalized = normalizeQuestionLabel(value).replace(/ /g, "-");
  return normalized.slice(0, 80) || "question";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function question(input: {
  id?: string | null;
  label: string;
  type: FormQuestionType;
  required?: boolean;
  options?: string[];
  atsField?: string | null;
}): FormQuestion {
  const options = (input.options ?? []).map((option) => option.trim()).filter(Boolean);
  return {
    id: (input.id ?? slug(input.label)).slice(0, 120),
    label: input.label.trim().slice(0, 300),
    type: input.type,
    required: Boolean(input.required),
    ...(options.length ? { options } : {}),
    ...(input.atsField ? { atsField: input.atsField.slice(0, 160) } : {}),
  };
}

export function readStoredQuestions(value: unknown): FormQuestion[] | null {
  if (!Array.isArray(value)) return null;
  const questions: FormQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const type = record.type;
    if (typeof record.id !== "string" || typeof record.label !== "string" || typeof type !== "string") return null;
    if (!QUESTION_TYPES.has(type as FormQuestionType)) return null;
    const options = Array.isArray(record.options)
      ? record.options.filter((option): option is string => typeof option === "string")
      : undefined;
    questions.push({
      id: record.id,
      label: record.label,
      type: type as FormQuestionType,
      required: record.required === true,
      ...(options && options.length ? { options } : {}),
      ...(typeof record.atsField === "string" ? { atsField: record.atsField } : {}),
    });
  }
  return dedupeQuestions(questions);
}

export function dedupeQuestions(questions: FormQuestion[]): FormQuestion[] {
  const seen = new Set<string>();
  const result: FormQuestion[] = [];
  for (const item of questions) {
    if (!item.label.trim()) continue;
    const type = QUESTION_TYPES.has(item.type) ? item.type : "short_text";
    let id = item.id || slug(item.label);
    while (seen.has(id)) id = `${id}-2`.slice(0, 120);
    seen.add(id);
    result.push({ ...item, id, type, label: item.label.trim() });
    if (result.length >= 80) break;
  }
  return result;
}

function mapGreenhouseType(type: string | null): FormQuestionType {
  switch ((type ?? "").toLowerCase()) {
    case "textarea":
    case "long_text":
      return "long_text";
    case "input_file":
    case "file":
      return "file";
    case "multi_value_single_select":
    case "select":
      return "select";
    case "multi_value_multi_select":
      return "multi_select";
    case "input_email":
    case "email":
      return "email";
    case "input_phone":
    case "phone":
      return "phone";
    case "input_url":
    case "url":
      return "url";
    case "input_date":
    case "date":
      return "date";
    case "input_number":
    case "number":
      return "number";
    case "boolean":
    case "yes_no":
      return "boolean";
    default:
      return "short_text";
  }
}

function optionLabels(value: unknown): string[] {
  return asArray(value)
    .map((item) => asString(asRecord(item).label) ?? asString(item))
    .filter((item): item is string => Boolean(item));
}

function questionList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record.questions)) return record.questions;
  if (asString(record.label)) return [value];
  return [];
}

function parseGreenhouseQuestion(raw: unknown): FormQuestion | null {
  const record = asRecord(raw);
  const label = asString(record.label);
  if (!label) return null;
  const fields = asArray(record.fields).map(asRecord);
  const field = fields[0] ?? {};
  const typeName = asString(field.type) ?? asString(record.type);
  const options = [...optionLabels(field.values), ...optionLabels(record.answer_options), ...optionLabels(record.values)];
  return question({
    id: asString(field.name) ?? asString(record.name) ?? asString(record.id) ?? slug(label),
    label,
    type: mapGreenhouseType(typeName),
    required: record.required === true,
    options,
    atsField: asString(field.name) ?? asString(record.name),
  });
}

export function parseGreenhouseQuestions(payload: unknown): FormQuestion[] {
  const job = asRecord(payload);
  const groups = [
    ...questionList(job.questions),
    ...questionList(job.demographic_questions),
    ...questionList(job.location_questions),
    ...questionList(job.eeoc_questions),
  ];
  return dedupeQuestions(
    groups
      .map(parseGreenhouseQuestion)
      .filter((item): item is FormQuestion => Boolean(item))
  );
}

export function greenhouseApplyUrl(payload: unknown, fallback: string | null): string | null {
  const job = asRecord(payload);
  return asString(job.absolute_url) ?? fallback;
}

function mapLeverType(type: string | null): FormQuestionType {
  switch ((type ?? "").toLowerCase()) {
    case "textarea":
    case "text-area":
      return "long_text";
    case "dropdown":
    case "multiple-choice":
    case "select":
      return "select";
    case "multiple-select":
      return "multi_select";
    case "file-upload":
    case "file":
      return "file";
    case "date":
      return "date";
    case "yes-no":
    case "boolean":
      return "boolean";
    default:
      return "short_text";
  }
}

function parseLeverCustom(raw: unknown): FormQuestion | null {
  const record = asRecord(raw);
  const label = asString(record.text) ?? asString(record.label) ?? asString(record.prompt);
  if (!label) return null;
  const options = asArray(record.options)
    .map((option) => asString(asRecord(option).text) ?? asString(option))
    .filter((option): option is string => Boolean(option));
  return question({
    id: asString(record.id) ?? slug(label),
    label,
    type: mapLeverType(asString(record.type)),
    required: record.required === true,
    options,
    atsField: asString(record.id),
  });
}

export function standardLeverQuestions(): FormQuestion[] {
  return [
    question({ id: "name", label: "Full name", type: "short_text", required: true, atsField: "name" }),
    question({ id: "email", label: "Email", type: "email", required: true, atsField: "email" }),
    question({ id: "phone", label: "Phone", type: "phone", required: true, atsField: "phone" }),
    question({ id: "linkedin", label: "LinkedIn URL", type: "url", atsField: "urls[LinkedIn]" }),
    question({ id: "github", label: "GitHub URL", type: "url", atsField: "urls[GitHub]" }),
    question({ id: "portfolio", label: "Portfolio URL", type: "url", atsField: "urls[Portfolio]" }),
    question({ id: "resume", label: "Resume", type: "file", required: true, atsField: "resume" }),
  ];
}

export function parseLeverQuestions(payload: unknown): { questions: FormQuestion[]; applyUrl: string | null; customCount: number } {
  const posting = asRecord(payload);
  const custom = [
    ...asArray(posting.customQuestions),
    ...asArray(posting.additionalQuestions),
    ...asArray(posting.applyQuestions),
  ]
    .map(parseLeverCustom)
    .filter((item): item is FormQuestion => Boolean(item));
  const applyUrl = asString(posting.applyUrl) ?? asString(posting.hostedUrl);
  return {
    questions: dedupeQuestions([...standardLeverQuestions(), ...custom]),
    applyUrl,
    customCount: custom.length,
  };
}

function mapAshbyType(type: string | null): FormQuestionType {
  switch ((type ?? "").toLowerCase()) {
    case "longtext":
    case "richtext":
      return "long_text";
    case "email":
      return "email";
    case "phone":
      return "phone";
    case "boolean":
      return "boolean";
    case "valueselect":
    case "select":
      return "select";
    case "multivalueselect":
      return "multi_select";
    case "date":
      return "date";
    case "file":
      return "file";
    case "number":
    case "currency":
      return "number";
    case "sociallink":
    case "url":
      return "url";
    default:
      return "short_text";
  }
}

function parseAshbyField(raw: unknown): FormQuestion | null {
  const wrapper = asRecord(raw);
  const field = asRecord(wrapper.field ?? wrapper);
  const label =
    asString(field.title) ??
    asString(field.humanReadablePath) ??
    asString(wrapper.title) ??
    asString(wrapper.label);
  if (!label) return null;
  const selectable = asArray(field.selectableValues ?? wrapper.selectableValues);
  const options = selectable
    .map((option) => asString(asRecord(option).label) ?? asString(option))
    .filter((option): option is string => Boolean(option));
  const required =
    wrapper.isRequired === true || field.isNullable === false || wrapper.required === true;
  return question({
    id: asString(field.path) ?? asString(field.id) ?? slug(label),
    label,
    type: mapAshbyType(asString(field.type) ?? asString(wrapper.type)),
    required,
    options,
    atsField: asString(field.path) ?? asString(field.id),
  });
}

function ashbyFieldList(form: unknown): unknown[] {
  const record = asRecord(form);
  const direct = [...asArray(record.fields), ...asArray(record.fieldEntries)];
  const sections = asArray(record.sections).flatMap((section) => {
    const sectionRecord = asRecord(section);
    return [...asArray(sectionRecord.fields), ...asArray(sectionRecord.fieldEntries)];
  });
  return [...direct, ...sections];
}

export function parseAshbyQuestions(payload: unknown): FormQuestion[] {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const posting = asRecord(data.jobPosting);
  const candidates = [
    root.applicationForm,
    root.applicationFormDefinition,
    posting.applicationForm,
    asRecord(root.job).applicationForm,
  ];
  const jobs = asArray(root.jobs);
  for (const job of jobs) candidates.push(asRecord(job).applicationForm);
  const fields = candidates.flatMap((form) => ashbyFieldList(form));
  return dedupeQuestions(
    fields.map(parseAshbyField).filter((item): item is FormQuestion => Boolean(item))
  );
}

export function standardQuestions(provider: ApplyProvider): FormQuestion[] {
  const common: FormQuestion[] = [
    question({ id: "legal-name", label: "Legal name", type: "short_text", required: true }),
    question({ id: "email", label: "Email", type: "email", required: true }),
    question({ id: "phone", label: "Phone", type: "phone", required: true }),
    question({ id: "city", label: "City", type: "short_text", required: true }),
    question({ id: "province", label: "Province", type: "short_text" }),
    question({ id: "linkedin", label: "LinkedIn URL", type: "url" }),
    question({ id: "github", label: "GitHub URL", type: "url" }),
    question({ id: "portfolio", label: "Portfolio URL", type: "url" }),
    question({
      id: "work-auth",
      label: "Are you legally authorized to work in Canada?",
      type: "select",
      required: true,
      options: ["Yes", "No"],
    }),
    question({
      id: "sponsorship",
      label: "Will you now or in the future require sponsorship to work in Canada?",
      type: "select",
      required: true,
      options: ["Yes", "No"],
    }),
    question({
      id: "relocate",
      label: "Are you willing to relocate?",
      type: "select",
      options: ["Yes", "No"],
    }),
    question({ id: "start", label: "Earliest start date", type: "date" }),
    question({ id: "salary", label: "Salary expectation (CAD)", type: "number" }),
    question({ id: "hear", label: "How did you hear about this job?", type: "short_text" }),
    question({ id: "pronouns", label: "Pronouns", type: "short_text" }),
    question({
      id: "gender",
      label: "Gender (voluntary self-identification)",
      type: "select",
      options: ["Prefer not to say", "Woman", "Man", "Non-binary"],
    }),
    question({
      id: "race",
      label: "Race or ethnicity (voluntary self-identification)",
      type: "select",
      options: ["Prefer not to say"],
    }),
    question({
      id: "veteran",
      label: "Veteran status (voluntary self-identification)",
      type: "select",
      options: ["Prefer not to say"],
    }),
    question({
      id: "disability",
      label: "Disability status (voluntary self-identification)",
      type: "select",
      options: ["Prefer not to say"],
    }),
    question({ id: "resume", label: "Resume", type: "file", required: true }),
    question({ id: "cover-letter", label: "Cover letter", type: "long_text" }),
  ];
  if (provider === "lever") return standardLeverQuestions();
  return common;
}
