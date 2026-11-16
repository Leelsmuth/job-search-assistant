/**
 * Minimal RFC 4180 CSV reading and writing. Pure functions, no DOM.
 *
 * Reading accepts what spreadsheet apps actually produce: a UTF-8 byte order
 * mark, CRLF / LF / CR line endings, quoted fields with embedded delimiters,
 * quotes, and newlines, and comma, semicolon, or tab delimiters (Excel uses
 * semicolons in locales where the comma is the decimal separator).
 */

export type CsvDelimiter = "," | ";" | "\t";

const DELIMITERS: readonly CsvDelimiter[] = [",", ";", "\t"];

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

/**
 * Decode file bytes. Tries strict UTF-8 first; a file that is not valid UTF-8
 * is almost always Excel's legacy "CSV (Comma delimited)" export, which is
 * Windows-1252, so fall back to that rather than showing replacement characters.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text: string;
  // Excel's "Unicode Text" export is UTF-16 with a byte order mark. Read as
  // UTF-8 it would be every other character a NUL.
  if (view[0] === 0xff && view[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(view);
  } else if (view[0] === 0xfe && view[1] === 0xff) {
    text = new TextDecoder("utf-16be").decode(view);
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(view);
    } catch {
      text = decodeWindows1252(view);
    }
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Control characters other than tab and line breaks. They are invisible in a
 * spreadsheet, and Postgres rejects NUL outright, so they are removed from
 * every value read from a file.
 */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "");
}

export function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

/**
 * Windows-1252 bytes 0x80–0x9F, where it differs from Latin-1. These are the
 * curly quotes, dashes, and euro sign that Excel exports are full of. Some
 * runtimes (Node without full ICU) decode "windows-1252" as Latin-1 and turn
 * these into invisible control characters, so map them here.
 */
const WINDOWS_1252_HIGH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž",
  0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

function decodeWindows1252(bytes: Uint8Array): string {
  return new TextDecoder("windows-1252")
    .decode(bytes)
    .replace(/[\u0080-\u009f]/g, (char) => WINDOWS_1252_HIGH[char.charCodeAt(0)] ?? char);
}

/**
 * Pick the delimiter from the first line: whichever of comma, semicolon, or
 * tab appears most often outside quotes. Defaults to comma.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts = new Map<CsvDelimiter, number>(DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === "\n" || char === "\r") break;
    if (counts.has(char as CsvDelimiter)) {
      counts.set(char as CsvDelimiter, counts.get(char as CsvDelimiter)! + 1);
    }
  }
  let best: CsvDelimiter = ",";
  for (const delimiter of DELIMITERS) {
    if (counts.get(delimiter)! > counts.get(best)!) best = delimiter;
  }
  return best;
}

/**
 * Parse CSV text into rows of fields. Rows that are entirely empty (blank
 * lines, or a line of bare delimiters) are dropped. Throws CsvParseError for an
 * unterminated quoted field, since everything after it would be misread.
 */
export function parseCsv(input: string, delimiter?: CsvDelimiter): string[][] {
  return parseCsvRecords(input, delimiter).rows;
}

/**
 * Like parseCsv, plus each kept row's 1-based record number: its row in the
 * spreadsheet it came from. Dropped empty rows still count, and a quoted value
 * spanning several lines is one record, so the numbers match what the visitor
 * sees in their spreadsheet app.
 */
export function parseCsvRecords(
  input: string,
  delimiter?: CsvDelimiter
): { rows: string[][]; recordNumbers: number[] } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  const recordNumbers: number[] = [];
  let record = 0;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteStartLine = 0;
  let line = 1;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    record++;
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
      recordNumbers.push(record);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line++;
        field += char;
      }
      continue;
    }
    if (char === '"' && field.trim() === "") {
      // Opening quote. Whitespace before it is dropped, as spreadsheet apps do.
      field = "";
      inQuotes = true;
      quoteStartLine = line;
    } else if (char === sep) {
      endField();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      endRow();
    } else {
      // A stray quote in the middle of an unquoted field is kept literally.
      field += char;
    }
  }

  if (inQuotes) {
    throw new CsvParseError(
      `A quoted value starting on line ${quoteStartLine} is never closed. Check for a missing " in that row.`
    );
  }
  if (field !== "" || row.length > 0) endRow();
  return { rows, recordNumbers };
}

/**
 * Spreadsheet apps run cells starting with these characters as formulas
 * ("CSV injection"), so exported text that starts with one gets a leading
 * apostrophe, which spreadsheets hide and treat as "this is text".
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function protectFormula(value: string): string {
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

/** Undo protectFormula, so an exported file imports back unchanged. */
export function unprotectFormula(value: string): string {
  return value.startsWith("'") && FORMULA_TRIGGER.test(value.slice(1)) ? value.slice(1) : value;
}

function escapeField(value: string): string {
  const safe = protectFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Serialize rows as RFC 4180 CSV: comma-delimited, CRLF line endings. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows.map((row) => row.map(escapeField).join(",")).join("\r\n") + "\r\n";
}
