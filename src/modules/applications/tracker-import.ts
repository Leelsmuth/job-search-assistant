/**
 * The contract between the import dialog and whatever saves the import. Pure:
 * runs in the browser (to build the request and preview updates) and on the
 * server (to validate the request and decide what an update changes), so both
 * sides share one definition of each.
 *
 * The server treats the request as untrusted input. It re-checks every value
 * with the same limits the file parser uses, and it works out duplicates and
 * update targets itself; a request can never name an application to change.
 */
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/utils";
import { stripControlCharacters } from "./csv";
import {
  formatCalendarDate,
  formatDisplayDate,
  formatWorkLocation,
  isUuid,
  parseCalendarDate,
  statusLabel,
} from "./tracker";
import {
  MAX_COMPANY,
  MAX_IMPORT_ROWS,
  MAX_LOCATION,
  MAX_NOTES,
  MAX_TITLE,
  parseImportUrl,
  type DuplicateCandidate,
  type DuplicateResolution,
  type ImportRowResult,
  type ImportSummary,
  type ImportValues,
  type WorkplaceType,
} from "./tracker-csv";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export type ImportRequestRow = { rowNumber: number; values: ImportValues };

export type ImportRequest = {
  /** Chosen by the dialog once per import, so a retried request is recognized and not applied twice. */
  importId: string;
  /** For the application history. Display only. */
  fileName: string;
  /** Only rows that can be imported: rows missing a company or role are not sent. */
  rows: ImportRequestRow[];
  /** The visitor's choice for each duplicate, by row number. Anything missing is skipped. */
  resolutions: Record<number, DuplicateResolution>;
};

/** What the dialog sends: every row that can be imported, and the choices for its duplicates. */
export function buildImportRequest(
  importId: string,
  fileName: string,
  rows: readonly ImportRowResult[],
  resolutions: Readonly<Record<number, DuplicateResolution>>
): ImportRequest {
  const sent = rows.flatMap((row) => (row.values ? [{ rowNumber: row.rowNumber, values: row.values }] : []));
  const numbers = new Set(sent.map((row) => row.rowNumber));
  const chosen: Record<number, DuplicateResolution> = {};
  for (const [key, value] of Object.entries(resolutions)) {
    if (numbers.has(Number(key))) chosen[Number(key)] = value;
  }
  return { importId, fileName, rows: sent, resolutions: chosen };
}

export class ImportRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRequestError";
  }
}

const MAX_FILE_NAME = 255;
const RESOLUTIONS = new Set<DuplicateResolution>(["skip", "update", "keep_both"]);
const WORKPLACES = new Set<WorkplaceType>(["remote", "hybrid", "on_site"]);
/** The same window the file parser accepts, so a date it read is never rejected here. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function singleLine(value: string): string {
  return stripControlCharacters(value).replace(/\s+/g, " ").trim();
}

function requiredText(value: unknown, label: string, max: number, row: number): string {
  if (typeof value !== "string") throw new ImportRequestError(`Row ${row}: ${label} is missing`);
  const text = singleLine(value);
  if (!text) throw new ImportRequestError(`Row ${row}: ${label} is missing`);
  if (text.length > max) throw new ImportRequestError(`Row ${row}: ${label} must be ${max} characters or fewer`);
  return text;
}

function optionalText(
  value: unknown,
  label: string,
  max: number,
  row: number,
  options: { multiline?: boolean } = {}
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ImportRequestError(`Row ${row}: ${label} must be text`);
  const text = options.multiline ? stripControlCharacters(value).trim() : singleLine(value);
  if (text.length > max) throw new ImportRequestError(`Row ${row}: ${label} must be ${max} characters or fewer`);
  return text || null;
}

function optionalDate(value: unknown, label: string, row: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ImportRequestError(`Row ${row}: ${label} must be a date`);
  let date: Date;
  try {
    date = parseCalendarDate(value, label);
  } catch {
    throw new ImportRequestError(`Row ${row}: ${label} must be a date (YYYY-MM-DD)`);
  }
  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new ImportRequestError(`Row ${row}: ${label} must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  return formatCalendarDate(date);
}

function parseValues(value: unknown, row: number): ImportValues {
  if (!isRecord(value)) throw new ImportRequestError(`Row ${row}: values are missing`);
  const status = value.status;
  if (typeof status !== "string" || !(APPLICATION_STATUSES as readonly string[]).includes(status)) {
    throw new ImportRequestError(`Row ${row}: status is not one we track`);
  }
  const workplace = value.workplaceType;
  if (workplace !== null && workplace !== undefined && !WORKPLACES.has(workplace as WorkplaceType)) {
    throw new ImportRequestError(`Row ${row}: workplace must be Remote, Hybrid, or On-site`);
  }
  let jobUrl: string | null = null;
  if (value.jobUrl !== null && value.jobUrl !== undefined && value.jobUrl !== "") {
    // The same check as the file parser: http(s) only, a real host, at most 2000 characters.
    jobUrl = typeof value.jobUrl === "string" ? parseImportUrl(value.jobUrl) : null;
    if (!jobUrl) throw new ImportRequestError(`Row ${row}: the job URL is not a web link`);
  }
  return {
    company: requiredText(value.company, "company", MAX_COMPANY, row),
    title: requiredText(value.title, "role", MAX_TITLE, row),
    status: status as ApplicationStatus,
    statusFromFile: value.statusFromFile === true,
    dateApplied: optionalDate(value.dateApplied, "date applied", row),
    followUpDate: optionalDate(value.followUpDate, "follow-up date", row),
    location: optionalText(value.location, "location", MAX_LOCATION, row),
    workplaceType: (workplace ?? null) as WorkplaceType | null,
    jobUrl,
    notes: optionalText(value.notes, "notes", MAX_NOTES, row, { multiline: true }),
  };
}

/**
 * Validate an import request from the browser. Values are cleaned the way the
 * file parser cleans them; anything outside its limits is rejected with the
 * row number, and nothing is imported.
 */
export function parseImportRequest(input: unknown): ImportRequest {
  if (!isRecord(input)) throw new ImportRequestError("The import request is empty");
  if (typeof input.importId !== "string" || !isUuid(input.importId)) {
    throw new ImportRequestError("The import request is missing its id");
  }
  const fileName =
    typeof input.fileName === "string" ? singleLine(input.fileName).slice(0, MAX_FILE_NAME) : "";
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new ImportRequestError("There are no rows to import");
  }
  if (input.rows.length > MAX_IMPORT_ROWS) {
    throw new ImportRequestError(`Import up to ${MAX_IMPORT_ROWS} rows at a time`);
  }

  const seen = new Set<number>();
  const rows = input.rows.map((raw, index): ImportRequestRow => {
    if (!isRecord(raw)) throw new ImportRequestError(`Row ${index + 1} of the request is not a row`);
    const rowNumber = raw.rowNumber;
    if (typeof rowNumber !== "number" || !Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1_000_000) {
      throw new ImportRequestError(`Row ${index + 1} of the request has no row number`);
    }
    if (seen.has(rowNumber)) throw new ImportRequestError(`Row ${rowNumber} appears twice in the request`);
    seen.add(rowNumber);
    return { rowNumber, values: parseValues(raw.values, rowNumber) };
  });

  const resolutions: Record<number, DuplicateResolution> = {};
  if (input.resolutions !== undefined) {
    if (!isRecord(input.resolutions)) throw new ImportRequestError("Duplicate choices are not valid");
    for (const [key, value] of Object.entries(input.resolutions)) {
      const rowNumber = Number(key);
      if (!seen.has(rowNumber)) continue;
      if (typeof value !== "string" || !RESOLUTIONS.has(value as DuplicateResolution)) {
        throw new ImportRequestError(`Row ${rowNumber}: the duplicate choice is not valid`);
      }
      resolutions[rowNumber] = value as DuplicateResolution;
    }
  }

  return { importId: input.importId, fileName, rows, resolutions };
}

/** The request's rows in the shape the duplicate and plan functions take. */
export function requestRowResults(request: ImportRequest): ImportRowResult[] {
  return request.rows.map((row) => ({
    rowNumber: row.rowNumber,
    values: row.values,
    error: null,
    missing: [],
    warnings: [],
  }));
}

// ---------------------------------------------------------------------------
// Existing applications and updates
// ---------------------------------------------------------------------------

/** An application already tracked, with what an update could change. */
export type ImportCandidate = DuplicateCandidate & {
  status: string;
  /** ISO timestamps, as the tracker stores them. */
  dateApplied: string | null;
  followUpDate: string | null;
  notes: string | null;
  location: string | null;
  workplaceType: string | null;
  /**
   * Whether the job's location, workplace, and link may be changed. True for
   * jobs the user entered (manually or by import); false for discovered jobs,
   * whose details come from the posting.
   */
  jobDetailsEditable: boolean;
};

export type TrackedUpdateChange = { field: string; label: string; before: string; after: string };

export type TrackedUpdate = {
  application: Partial<{
    status: ApplicationStatus;
    dateApplied: string;
    followUpDate: string;
    notes: string;
  }>;
  job: Partial<{ location: string; workplaceType: WorkplaceType; jobUrl: string }>;
  /** For the dialog and the application history. Empty when nothing would change. */
  changes: TrackedUpdateChange[];
};

function shortText(value: string | null): string {
  if (!value) return "—";
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/**
 * What "Update" does to a tracked application: non-blank values from the row
 * replace the application's. Blank cells never erase anything, a status that
 * was guessed (blank or unrecognized in the file) is not written, and dates
 * count as changed only when the calendar day differs.
 */
export function planTrackedUpdate(candidate: ImportCandidate, values: ImportValues): TrackedUpdate {
  const update: TrackedUpdate = { application: {}, job: {}, changes: [] };
  const change = (field: string, label: string, before: string, after: string) =>
    update.changes.push({ field, label, before, after });

  if (values.statusFromFile && values.status !== candidate.status) {
    update.application.status = values.status;
    change("status", "Status", statusLabel(candidate.status), statusLabel(values.status));
  }
  if (values.dateApplied && values.dateApplied !== formatCalendarDate(candidate.dateApplied)) {
    update.application.dateApplied = values.dateApplied;
    change("dateApplied", "Date applied", formatDisplayDate(candidate.dateApplied), formatDisplayDate(values.dateApplied));
  }
  if (values.followUpDate && values.followUpDate !== formatCalendarDate(candidate.followUpDate)) {
    update.application.followUpDate = values.followUpDate;
    change("followUpDate", "Follow-up", formatDisplayDate(candidate.followUpDate), formatDisplayDate(values.followUpDate));
  }
  if (values.notes && values.notes !== (candidate.notes ?? "")) {
    update.application.notes = values.notes;
    change("notes", "Notes", shortText(candidate.notes), shortText(values.notes));
  }

  if (candidate.jobDetailsEditable) {
    const location = values.location ?? candidate.location;
    const workplace = values.workplaceType ?? candidate.workplaceType;
    if (values.location && values.location !== candidate.location) update.job.location = values.location;
    if (values.workplaceType && values.workplaceType !== candidate.workplaceType) {
      update.job.workplaceType = values.workplaceType;
    }
    if (update.job.location !== undefined || update.job.workplaceType !== undefined) {
      change(
        "location",
        "Location",
        formatWorkLocation(candidate.location, candidate.workplaceType),
        formatWorkLocation(location, workplace)
      );
    }
    if (values.jobUrl && values.jobUrl !== candidate.jobUrl) {
      update.job.jobUrl = values.jobUrl;
      change("jobUrl", "Job URL", candidate.jobUrl ?? "—", values.jobUrl);
    }
  }
  return update;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type ImportResult =
  | {
      status: "imported";
      /** What was saved. Rows missing a company or role never reach the server; the dialog adds them. */
      summary: ImportSummary & { unchanged: number };
    }
  /** A retry of an import that was already saved. Nothing was changed this time. */
  | { status: "already_imported" };

/** What the import server action returns. Failures are values: Next.js hides thrown messages in production. */
export type ImportActionResult = ImportResult | { status: "error"; message: string };

/** What the server action for the preview's duplicate check returns. */
export type ImportCandidatesResult =
  | { status: "ok"; candidates: ImportCandidate[] }
  | { status: "error"; message: string };
