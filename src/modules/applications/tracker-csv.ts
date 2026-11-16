/**
 * Spreadsheet import and export for the application tracker. Pure functions:
 * the UI reads the file and the store applies the result.
 *
 * Import runs in stages so the visitor can check each one:
 *   readImportTable  → headers + rows from CSV text (size and row limits)
 *   guessColumnMapping / detectDateFormat → a starting mapping they can change
 *   normalizeImportRows → one result per row: the values to import, warnings
 *                         about values that were dropped or guessed, or the
 *                         reason the row will be skipped
 *   findImportDuplicates → rows that match an application already tracked, or
 *                          an earlier row of the same file
 *
 * Export writes the same column names the importer recognizes, so a file can
 * be exported, edited in a spreadsheet, and imported back.
 */
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/utils";
import {
  formatCalendarDate,
  safeHttpUrl,
  statusLabel,
  type TrackedApplication,
} from "./tracker";
import {
  CsvParseError,
  parseCsvRecords,
  stripControlCharacters,
  toCsv,
  unprotectFormula,
} from "./csv";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Large enough for years of applications, small enough for browser storage. */
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

export const MAX_COMPANY = 160;
export const MAX_TITLE = 200;
export const MAX_LOCATION = 200;
export const MAX_NOTES = 8000;
export const MAX_URL = 2000;

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const IMPORT_FIELDS = [
  "company",
  "title",
  "status",
  "dateApplied",
  "followUpDate",
  "location",
  "workplaceType",
  "jobUrl",
  "notes",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ["company", "title"];

/** Column headers used by export. Each one is also recognized on import. */
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  company: "Company",
  title: "Role",
  status: "Status",
  dateApplied: "Date applied",
  followUpDate: "Follow-up date",
  location: "Location",
  workplaceType: "Workplace",
  jobUrl: "Job URL",
  notes: "Notes",
};

export const IMPORT_FIELD_HINTS: Record<ImportField, string> = {
  company: "Required",
  title: "Required",
  status: "Saved, Applied, Interviewing, Offer, Rejected, Withdrawn…",
  dateApplied: "A date",
  followUpDate: "A date",
  location: "Free text",
  workplaceType: "Remote, Hybrid, or On-site",
  jobUrl: "Link to the posting",
  notes: "Free text",
};

/** Normalized header text → field. Checked for exact matches first, then containment. */
const HEADER_SYNONYMS: Record<ImportField, readonly string[]> = {
  company: ["company", "company name", "employer", "organization", "organisation", "org"],
  title: ["role", "title", "job title", "position", "job", "role title", "job role", "position title"],
  status: ["status", "stage", "application status", "state"],
  dateApplied: [
    "date applied",
    "applied",
    "applied on",
    "applied date",
    "application date",
    "date of application",
    "submitted",
    "date submitted",
  ],
  followUpDate: [
    "follow up date",
    "follow up",
    "followup",
    "followup date",
    "follow up on",
    "next follow up",
    "reminder",
    "next step date",
  ],
  location: ["location", "city", "place"],
  workplaceType: ["workplace", "workplace type", "work type", "work mode", "remote", "arrangement", "work arrangement"],
  jobUrl: ["job url", "url", "link", "job link", "posting", "posting url", "job posting", "listing"],
  notes: ["notes", "note", "comments", "comment", "details"],
};

/**
 * Synonyms too generic to match inside a longer header: "Company URL" is not
 * the job link, and "Applied (Y/N)" is not a date. They still match exactly.
 */
const EXACT_ONLY_SYNONYMS = new Set(["job", "org", "state", "place", "details", "applied", "url", "link", "remote", "posting", "listing", "submitted"]);

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ColumnMapping = Record<ImportField, number | null>;

export function emptyColumnMapping(): ColumnMapping {
  return Object.fromEntries(IMPORT_FIELDS.map((field) => [field, null])) as ColumnMapping;
}

/**
 * Suggest a column for each field from the header names. Each column is used
 * at most once. Exact synonym matches win over partial ones, so "Date applied"
 * goes to the applied date rather than being read as a status.
 */
export function guessColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping = emptyColumnMapping();
  const used = new Set<number>();
  const normalized = headers.map(normalizeHeader);

  const assign = (matches: (header: string, synonym: string) => boolean) => {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] !== null) continue;
      for (const synonym of HEADER_SYNONYMS[field]) {
        const index = normalized.findIndex(
          (header, column) => !used.has(column) && header !== "" && matches(header, synonym)
        );
        if (index !== -1) {
          mapping[field] = index;
          used.add(index);
          break;
        }
      }
    }
  };

  assign((header, synonym) => header === synonym);
  // Partial: "Current status" → status. Whole words only, so "role" does not match "payroll".
  assign(
    (header, synonym) =>
      !EXACT_ONLY_SYNONYMS.has(synonym) && ` ${header} `.includes(` ${synonym} `)
  );
  return mapping;
}

export function missingRequiredFields(mapping: ColumnMapping): ImportField[] {
  return REQUIRED_IMPORT_FIELDS.filter((field) => mapping[field] === null);
}

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

export type ImportTable = {
  /** Display names: blank and repeated headers get a column number. */
  headers: string[];
  rows: string[][];
  /** Each row's number in the visitor's spreadsheet (the header is usually row 1). */
  rowNumbers: number[];
};

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

const SPREADSHEET_EXTENSIONS = /\.(xlsx|xlsm|xls|ods|numbers)$/i;

/** Reject files we cannot read before decoding them. */
export function checkImportFile(file: { name: string; size: number }): void {
  if (SPREADSHEET_EXTENSIONS.test(file.name)) {
    throw new ImportFileError(
      "That is a spreadsheet file, not a CSV. In your spreadsheet app, choose File → Download or Save As → CSV, then choose that file."
    );
  }
  if (file.size === 0) throw new ImportFileError("That file is empty.");
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ImportFileError(
      `That file is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB. Remove columns you do not need, or split it into smaller files.`
    );
  }
}

function displayHeaders(raw: readonly string[], width: number): string[] {
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (let column = 0; column < width; column++) {
    const name = stripControlCharacters(raw[column] ?? "").trim();
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    headers.push(name && count === 0 ? name : `${name || "Column"} (column ${column + 1})`);
  }
  return headers;
}

/** Parse CSV text whose first non-blank row is the header row. */
export function readImportTable(text: string): ImportTable {
  let parsed: ReturnType<typeof parseCsvRecords>;
  try {
    parsed = parseCsvRecords(text);
  } catch (error) {
    if (error instanceof CsvParseError) throw new ImportFileError(error.message);
    throw error;
  }
  if (parsed.rows.length === 0) throw new ImportFileError("That file has no rows.");
  const [headerRow, ...rows] = parsed.rows;
  if (rows.length === 0) {
    throw new ImportFileError(
      "That file only has a header row. Add at least one application below the headers."
    );
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(
      `That file has ${rows.length} rows. The demo imports up to ${MAX_IMPORT_ROWS} at a time; split the file and import each part.`
    );
  }
  const width = Math.max(headerRow.length, ...rows.map((row) => row.length));
  return { headers: displayHeaders(headerRow, width), rows, rowNumbers: parsed.recordNumbers.slice(1) };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * How to read dates written with slashes, dots, or dashes in day/month order.
 * ISO dates (2025-03-14) and dates with month names (Mar 14, 2025) are read
 * the same way under either setting.
 */
export type ImportDateFormat = "mdy" | "dmy";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/** "Mar", "Mar.", "March", and "Sept" are months; "Marchish" is not. */
function monthFromName(value: string): number | null {
  const word = value.toLowerCase().replace(/\.$/, "");
  if (word.length < 3) return null;
  const index = MONTHS.findIndex((month) => month.startsWith(word));
  return index === -1 ? null : index + 1;
}

function fullYear(value: string): number {
  const year = Number(value);
  return value.length === 2 ? 2000 + year : year;
}

function calendarDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return formatCalendarDate(date);
}

const ISO_DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/;
const NUMERIC_DATE = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:\s.*)?$/;
const MONTH_FIRST = /^([a-z]+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i;
const DAY_FIRST = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]+\.?)[\s,-]+(\d{2}|\d{4})$/i;
const WEEKDAY_PREFIX = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i;

/** Parse a spreadsheet date into YYYY-MM-DD, or null when it is not a date. */
export function parseImportDate(value: string, format: ImportDateFormat): string | null {
  // "Fri, Mar 14, 2025" → "Mar 14, 2025"
  const text = value.trim().replace(WEEKDAY_PREFIX, "");
  if (!text) return null;

  let match = ISO_DATE.exec(text);
  if (match) return calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = NUMERIC_DATE.exec(text);
  if (match) {
    const [first, second] = [Number(match[1]), Number(match[2])];
    const year = fullYear(match[3]);
    return format === "dmy" ? calendarDate(year, second, first) : calendarDate(year, first, second);
  }

  match = MONTH_FIRST.exec(text);
  if (match) {
    const month = monthFromName(match[1]);
    return month ? calendarDate(Number(match[3]), month, Number(match[2])) : null;
  }

  match = DAY_FIRST.exec(text);
  if (match) {
    const month = monthFromName(match[2]);
    return month ? calendarDate(fullYear(match[3]), month, Number(match[1])) : null;
  }
  return null;
}

/**
 * Guess day/month order from the mapped date columns. A first number above 12
 * means day first; a second number above 12 means month first. When every date
 * is ambiguous (or there are none), month first is assumed and `ambiguous` is
 * true so the UI can ask.
 */
export function detectDateFormat(
  rows: readonly string[][],
  columns: ReadonlyArray<number | null>
): { format: ImportDateFormat; ambiguous: boolean } {
  let dayFirst = 0;
  let monthFirst = 0;
  let numeric = 0;
  for (const row of rows) {
    for (const column of columns) {
      if (column === null) continue;
      const match = NUMERIC_DATE.exec((row[column] ?? "").trim());
      if (!match) continue;
      numeric++;
      if (Number(match[1]) > 12) dayFirst++;
      if (Number(match[2]) > 12) monthFirst++;
    }
  }
  if (dayFirst > monthFirst) return { format: "dmy", ambiguous: false };
  if (monthFirst > dayFirst) return { format: "mdy", ambiguous: false };
  return { format: "mdy", ambiguous: numeric > 0 };
}

// ---------------------------------------------------------------------------
// Statuses and workplace
// ---------------------------------------------------------------------------

/** Common spreadsheet wording for each status, beyond the tracker's own labels. */
const STATUS_SYNONYMS: Record<string, ApplicationStatus> = {
  wishlist: "saved",
  "wish list": "saved",
  bookmarked: "saved",
  interested: "saved",
  "to apply": "saved",
  "not applied": "saved",
  "not yet applied": "saved",
  todo: "saved",
  "to do": "saved",
  submitted: "applied",
  "application submitted": "applied",
  "applied online": "applied",
  interview: "interviewing",
  interviews: "interviewing",
  "in progress": "interviewing",
  "phone screen": "recruiter_screen",
  screen: "recruiter_screen",
  screening: "recruiter_screen",
  "hr screen": "recruiter_screen",
  "technical screen": "technical_interview",
  "tech interview": "technical_interview",
  "coding interview": "technical_interview",
  onsite: "final_interview",
  "on site": "final_interview",
  "final round": "final_interview",
  offered: "offer",
  "offer received": "offer",
  "offer extended": "offer",
  reject: "rejected",
  rejection: "rejected",
  "not selected": "rejected",
  "no offer": "rejected",
  "position filled": "rejected",
  withdraw: "withdrawn",
  withdrew: "withdrawn",
  "no longer interested": "withdrawn",
};

const STATUS_LOOKUP: Map<string, ApplicationStatus> = (() => {
  const lookup = new Map<string, ApplicationStatus>();
  for (const status of APPLICATION_STATUSES) {
    lookup.set(normalizeHeader(status), status);
    lookup.set(normalizeHeader(statusLabel(status)), status);
  }
  for (const [text, status] of Object.entries(STATUS_SYNONYMS)) lookup.set(text, status);
  return lookup;
})();

/** Read a spreadsheet status cell. Null when it is blank or not recognized. */
export function parseImportStatus(value: string): ApplicationStatus | null {
  const key = normalizeHeader(value);
  return key ? (STATUS_LOOKUP.get(key) ?? null) : null;
}

export type WorkplaceType = "remote" | "hybrid" | "on_site";

const WORKPLACE_LOOKUP: Record<string, WorkplaceType> = {
  remote: "remote",
  "fully remote": "remote",
  "remote first": "remote",
  wfh: "remote",
  hybrid: "hybrid",
  "on site": "on_site",
  onsite: "on_site",
  "in office": "on_site",
  "in person": "on_site",
  office: "on_site",
};

export function parseImportWorkplace(value: string): WorkplaceType | null {
  return WORKPLACE_LOOKUP[normalizeHeader(value)] ?? null;
}

/** Accept bare links like "www.example.com/jobs/1" that spreadsheets often hold. */
export function parseImportUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  const url = safeHttpUrl(withScheme);
  if (!url || url.length > MAX_URL) return null;
  // "https://TBD" parses, but a host without a dot is not a posting link.
  return new URL(url).hostname.includes(".") ? url : null;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type ImportValues = {
  company: string;
  title: string;
  status: ApplicationStatus;
  /** False when the status was blank or unrecognized and was inferred. */
  statusFromFile: boolean;
  dateApplied: string | null;
  followUpDate: string | null;
  location: string | null;
  workplaceType: WorkplaceType | null;
  jobUrl: string | null;
  notes: string | null;
};

/** Something about one field of a row: a value that was dropped, shortened, guessed, or is missing. */
export type ImportIssue = { field: ImportField; message: string };

export type ImportRowResult = {
  /** The row's number in the visitor's spreadsheet (see ImportTable.rowNumbers). */
  rowNumber: number;
  values: ImportValues | null;
  /** Why the row will be skipped. Set exactly when values is null. */
  error: string | null;
  /** The required fields that are blank. Non-empty exactly when values is null. */
  missing: ImportField[];
  /** Values that were dropped, shortened, or guessed. A valid row still imports. */
  warnings: ImportIssue[];
};

/**
 * Cell values the visitor typed in the preview, by row number and field. They
 * replace what the file says and go through the same checks, so an edit can
 * only ever produce a row the importer would have accepted from the file.
 */
export type ImportEdits = Readonly<Record<number, Readonly<Partial<Record<ImportField, string>>>>>;

function cell(row: readonly string[], column: number | null): string {
  if (column === null) return "";
  return unprotectFormula(stripControlCharacters(row[column] ?? "").trim());
}

/** What the file says for a field of a row, ignoring edits. Blank when the field is not mapped. */
export function rawImportValue(
  table: ImportTable,
  mapping: ColumnMapping,
  rowNumber: number,
  field: ImportField
): string {
  return cell(tableRowFor(table, rowNumber), mapping[field]);
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeImportRow(
  row: readonly string[],
  rowNumber: number,
  mapping: ColumnMapping,
  dateFormat: ImportDateFormat,
  edits: Readonly<Partial<Record<ImportField, string>>> = {}
): ImportRowResult {
  const warnings: ImportIssue[] = [];
  const warn = (field: ImportField, message: string) => warnings.push({ field, message });
  const read = (field: ImportField) => {
    const edited = edits[field];
    return edited !== undefined ? stripControlCharacters(edited).trim() : cell(row, mapping[field]);
  };
  const clip = (field: ImportField, value: string, max: number) => {
    if (value.length <= max) return value;
    warn(field, `${IMPORT_FIELD_LABELS[field]} was shortened to ${max} characters`);
    return value.slice(0, max);
  };

  const company = singleLine(read("company"));
  const title = singleLine(read("title"));

  const readDate = (field: "dateApplied" | "followUpDate") => {
    const raw = read(field);
    if (!raw) return null;
    const parsed = parseImportDate(raw, dateFormat);
    if (!parsed) {
      warn(field, `${IMPORT_FIELD_LABELS[field]} "${raw}" is not a date we can read, so it was left blank`);
    }
    return parsed;
  };
  const dateApplied = readDate("dateApplied");
  const followUpDate = readDate("followUpDate");

  const rawStatus = read("status");
  const parsedStatus = parseImportStatus(rawStatus);
  // Without a usable status, a row with an applied date has clearly been applied to.
  const status: ApplicationStatus = parsedStatus ?? (dateApplied ? "applied" : "saved");
  if (rawStatus && !parsedStatus) {
    warn("status", `Status "${rawStatus}" is not one we track, so it was imported as ${statusLabel(status)}`);
  }

  const rawWorkplace = read("workplaceType");
  const workplaceType = parseImportWorkplace(rawWorkplace);
  if (rawWorkplace && !workplaceType) {
    warn("workplaceType", `Workplace "${rawWorkplace}" is not Remote, Hybrid, or On-site, so it was left blank`);
  }

  const rawUrl = read("jobUrl");
  const jobUrl = parseImportUrl(rawUrl);
  if (rawUrl && !jobUrl) warn("jobUrl", `"${rawUrl}" is not a web link, so the job URL was left blank`);

  const location = singleLine(read("location"));
  const notes = read("notes");

  const values: ImportValues = {
    company: clip("company", company, MAX_COMPANY),
    title: clip("title", title, MAX_TITLE),
    status,
    statusFromFile: parsedStatus !== null,
    dateApplied,
    followUpDate,
    location: location ? clip("location", location, MAX_LOCATION) : null,
    workplaceType,
    jobUrl,
    notes: notes ? clip("notes", notes, MAX_NOTES) : null,
  };

  // Every field is checked even when the row will be skipped, so fixing the
  // missing field shows everything else that needs attention at once.
  const missing = REQUIRED_IMPORT_FIELDS.filter((field) => (field === "company" ? !company : !title));
  if (missing.length > 0) {
    const names = missing.map((field) => (field === "company" ? "company" : "role"));
    return { rowNumber, values: null, error: `Missing ${names.join(" and ")}`, missing, warnings };
  }
  return { rowNumber, values, error: null, missing: [], warnings };
}

/** The file row behind a result, e.g. to show what a skipped row said. */
export function tableRowFor(table: ImportTable, rowNumber: number): readonly string[] {
  return table.rows[table.rowNumbers.indexOf(rowNumber)] ?? [];
}

export function normalizeImportRows(
  table: ImportTable,
  mapping: ColumnMapping,
  dateFormat: ImportDateFormat,
  edits: ImportEdits = {}
): ImportRowResult[] {
  // Row numbers match what the visitor sees in their spreadsheet, even with empty rows in between.
  return table.rows.map((row, index) => {
    const rowNumber = table.rowNumbers[index];
    return normalizeImportRow(row, rowNumber, mapping, dateFormat, edits[rowNumber]);
  });
}

/** Set one edited cell. A value equal to the file's removes the edit, so the row counts as unedited. */
export function withImportEdit(
  edits: ImportEdits,
  rowNumber: number,
  field: ImportField,
  value: string,
  fileValue: string
): ImportEdits {
  const row = { ...edits[rowNumber] };
  if (value === fileValue) delete row[field];
  else row[field] = value;
  const next = { ...edits };
  if (Object.keys(row).length === 0) delete next[rowNumber];
  else next[rowNumber] = row;
  return next;
}

/** Drop a row's edits, back to what the file says. */
export function withoutImportEdits(edits: ImportEdits, rowNumber: number): ImportEdits {
  if (!(rowNumber in edits)) return edits;
  const next = { ...edits };
  delete next[rowNumber];
  return next;
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export type DuplicateCandidate = {
  id: string;
  companyName: string;
  title: string;
  jobUrl: string | null;
};

export type ImportDuplicate<T extends DuplicateCandidate = DuplicateCandidate> =
  | { kind: "existing"; application: T }
  | { kind: "file"; rowNumber: number };

/** What to do with a row that matches something already tracked or imported. */
export type DuplicateResolution = "skip" | "update" | "keep_both";

function identityText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Company names often differ only by a legal suffix between a spreadsheet and a posting. */
function companyKey(value: string): string {
  return identityText(value)
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc)$/, "")
    .trim();
}

/** Same posting even if one copy has tracking parameters, a fragment, or a trailing slash. */
export function jobUrlKey(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|ref$|source$|src$|gh_src$|lever-source)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}${url.search}`.toLowerCase();
  } catch {
    return null;
  }
}

function isSameJob(
  a: { company: string; title: string; jobUrl: string | null },
  b: { company: string; title: string; jobUrl: string | null }
): boolean {
  const aUrl = jobUrlKey(a.jobUrl);
  const bUrl = jobUrlKey(b.jobUrl);
  if (aUrl && bUrl && aUrl === bUrl) return true;
  // Two different links at the same company and role are two postings (e.g. two cities).
  if (aUrl && bUrl) return false;
  return companyKey(a.company) === companyKey(b.company) && identityText(a.title) === identityText(b.title);
}

/**
 * Find rows that repeat something. A row is checked against earlier rows of
 * the same file first (so one application in the tracker is not matched, and
 * possibly updated, twice), then against applications already tracked.
 * Returns a map from row number to its match.
 */
export function findImportDuplicates<T extends DuplicateCandidate>(
  rows: readonly ImportRowResult[],
  existing: readonly T[]
): Map<number, ImportDuplicate<T>> {
  const duplicates = new Map<number, ImportDuplicate<T>>();
  const earlier: Array<{ rowNumber: number; values: ImportValues }> = [];
  for (const row of rows) {
    if (!row.values) continue;
    const values = row.values;
    const fileMatch = earlier.find((other) => isSameJob(other.values, values));
    if (fileMatch) {
      duplicates.set(row.rowNumber, { kind: "file", rowNumber: fileMatch.rowNumber });
    } else {
      const application = existing.find((candidate) =>
        isSameJob({ company: candidate.companyName, title: candidate.title, jobUrl: candidate.jobUrl }, values)
      );
      if (application) duplicates.set(row.rowNumber, { kind: "existing", application });
    }
    earlier.push({ rowNumber: row.rowNumber, values });
  }
  return duplicates;
}

/** Updating only makes sense against the tracker; a repeated file row can be skipped or kept. */
export function resolutionOptions(duplicate: ImportDuplicate): DuplicateResolution[] {
  return duplicate.kind === "existing" ? ["skip", "update", "keep_both"] : ["skip", "keep_both"];
}

export function defaultResolution(): DuplicateResolution {
  return "skip";
}

export function resolutionFor(
  duplicate: ImportDuplicate,
  chosen: DuplicateResolution | undefined
): DuplicateResolution {
  const resolution = chosen ?? defaultResolution();
  return resolutionOptions(duplicate).includes(resolution) ? resolution : "skip";
}

export type ImportPlanItem =
  | { action: "add"; rowNumber: number; values: ImportValues }
  | { action: "update"; rowNumber: number; values: ImportValues; applicationId: string }
  | { action: "skip"; rowNumber: number; reason: "invalid" | "duplicate" };

export type ImportSummary = { add: number; update: number; skipInvalid: number; skipDuplicate: number };

/** Turn rows plus the visitor's duplicate choices into what will happen to each row. */
export function planImport(
  rows: readonly ImportRowResult[],
  duplicates: ReadonlyMap<number, ImportDuplicate>,
  resolutions: Readonly<Record<number, DuplicateResolution>>
): ImportPlanItem[] {
  return rows.map((row): ImportPlanItem => {
    if (!row.values) return { action: "skip", rowNumber: row.rowNumber, reason: "invalid" };
    const duplicate = duplicates.get(row.rowNumber);
    if (!duplicate) return { action: "add", rowNumber: row.rowNumber, values: row.values };
    const resolution = resolutionFor(duplicate, resolutions[row.rowNumber]);
    if (resolution === "keep_both") return { action: "add", rowNumber: row.rowNumber, values: row.values };
    if (resolution === "update" && duplicate.kind === "existing") {
      return {
        action: "update",
        rowNumber: row.rowNumber,
        values: row.values,
        applicationId: duplicate.application.id,
      };
    }
    return { action: "skip", rowNumber: row.rowNumber, reason: "duplicate" };
  });
}

export function summarizePlan(plan: readonly ImportPlanItem[]): ImportSummary {
  const summary: ImportSummary = { add: 0, update: 0, skipInvalid: 0, skipDuplicate: 0 };
  for (const item of plan) {
    if (item.action === "add") summary.add++;
    else if (item.action === "update") summary.update++;
    else if (item.reason === "invalid") summary.skipInvalid++;
    else summary.skipDuplicate++;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const WORKPLACE_EXPORT: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  on_site: "On-site",
};

/**
 * The tracker as CSV, one row per application, sorted by company then role.
 * Dates are YYYY-MM-DD so no spreadsheet misreads the day and month.
 */
export function exportTrackerCsv(applications: readonly TrackedApplication[]): string {
  const header = IMPORT_FIELDS.map((field) => IMPORT_FIELD_LABELS[field]);
  const sorted = applications
    .slice()
    .sort(
      (a, b) =>
        a.companyName.localeCompare(b.companyName, "en", { sensitivity: "base" }) ||
        a.title.localeCompare(b.title, "en", { sensitivity: "base" })
    );
  const rows = sorted.map((application) => {
    const values: Record<ImportField, string> = {
      company: application.companyName,
      title: application.title,
      status: statusLabel(application.status),
      dateApplied: formatCalendarDate(application.dateApplied),
      followUpDate: formatCalendarDate(application.followUpDate),
      location: application.location ?? "",
      workplaceType: application.workplaceType ? (WORKPLACE_EXPORT[application.workplaceType] ?? "") : "",
      jobUrl: application.jobUrl ?? "",
      notes: application.notes ?? "",
    };
    return IMPORT_FIELDS.map((field) => values[field]);
  });
  return toCsv([header, ...rows]);
}

/** Named for the visitor's local date, which is the day they will look for in Downloads. */
/** A small example file for visitors who want to see the expected columns. */
export function importTemplateCsv(): string {
  return toCsv([
    IMPORT_FIELDS.map((field) => IMPORT_FIELD_LABELS[field]),
    [
      "Example Co",
      "Frontend Developer",
      "Applied",
      "2025-03-14",
      "2025-03-28",
      "Toronto, ON",
      "Hybrid",
      "https://example.com/jobs/123",
      "Referred by a former colleague",
    ],
    ["Sample Studio", "UI Engineer", "Saved", "", "", "", "Remote", "", ""],
  ]);
}

export function exportFileName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `job-applications-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}
