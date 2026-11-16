import { describe, expect, it } from "vitest";
import {
  CsvParseError,
  decodeCsvBytes,
  detectDelimiter,
  parseCsv,
  parseCsvRecords,
  protectFormula,
  toCsv,
  unprotectFormula,
} from "@/modules/applications/csv";
import {
  IMPORT_FIELDS,
  ImportFileError,
  MAX_IMPORT_ROWS,
  checkImportFile,
  detectDateFormat,
  emptyColumnMapping,
  exportFileName,
  exportTrackerCsv,
  findImportDuplicates,
  guessColumnMapping,
  jobUrlKey,
  missingRequiredFields,
  normalizeImportRows,
  parseImportDate,
  parseImportStatus,
  parseImportUrl,
  parseImportWorkplace,
  planImport,
  readImportTable,
  resolutionFor,
  summarizePlan,
  rawImportValue,
  tableRowFor,
  withImportEdit,
  withoutImportEdits,
  type ColumnMapping,
  type ImportRowResult,
} from "@/modules/applications/tracker-csv";
import type { TrackedApplication } from "@/modules/applications/tracker";

describe("parseCsv", () => {
  it("reads quoted fields with delimiters, escaped quotes, and newlines", () => {
    const text = 'Company,Notes\r\n"Acme, Inc.","Said ""call me""\nnext week"\r\nGlobex,plain\r\n';
    expect(parseCsv(text)).toEqual([
      ["Company", "Notes"],
      ["Acme, Inc.", 'Said "call me"\nnext week'],
      ["Globex", "plain"],
    ]);
  });

  it("handles LF, CR, a byte order mark, blank lines, and no trailing newline", () => {
    expect(parseCsv("\uFEFFa,b\n\n1,2\r3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("drops rows that are only delimiters, as spreadsheets export for empty rows", () => {
    expect(parseCsv("a,b\n,,\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("numbers records as spreadsheet rows, counting dropped empty rows and not multi-line values", () => {
    const text = 'Company,Notes\n\nAcme,"two\nlines"\n,\nGlobex,x\n';
    expect(parseCsvRecords(text)).toEqual({
      rows: [
        ["Company", "Notes"],
        ["Acme", "two\nlines"],
        ["Globex", "x"],
      ],
      recordNumbers: [1, 3, 5],
    });
  });

  it("keeps empty fields and trailing empty fields", () => {
    expect(parseCsv("a,b,c\n1,,\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
    ]);
  });

  it("detects semicolon and tab delimiters from the header line", () => {
    expect(detectDelimiter("Company;Role;Notes\nA;B;C,D")).toBe(";");
    expect(detectDelimiter("Company\tRole\nA\tB")).toBe("\t");
    expect(detectDelimiter('"a;b",c\n')).toBe(",");
    expect(parseCsv("Company;Role\nAcme;Dev, Frontend")).toEqual([
      ["Company", "Role"],
      ["Acme", "Dev, Frontend"],
    ]);
  });

  it("reports an unterminated quote with its line", () => {
    expect(() => parseCsv('a,b\n1,"oops\n2,3')).toThrow(CsvParseError);
    expect(() => parseCsv('a,b\n1,"oops\n2,3')).toThrow(/line 2/);
  });
});

describe("decodeCsvBytes", () => {
  it("reads UTF-8 and strips the byte order mark", () => {
    const bytes = new TextEncoder().encode("\uFEFFCafé,Zoë");
    expect(decodeCsvBytes(bytes)).toBe("Café,Zoë");
  });

  it("falls back to Windows-1252 for legacy Excel exports", () => {
    // "Café – Zoë" in Windows-1252: é = 0xE9, en dash = 0x96, ë = 0xEB.
    const bytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x96, 0x20, 0x5a, 0x6f, 0xeb]);
    expect(decodeCsvBytes(bytes)).toBe("Café – Zoë");
  });
});

describe("toCsv", () => {
  it("quotes only when needed and uses CRLF", () => {
    expect(toCsv([["a", "b,c"], ['say "hi"', "line\nbreak"]])).toBe(
      'a,"b,c"\r\n"say ""hi""","line\nbreak"\r\n'
    );
  });

  it("neutralizes spreadsheet formulas and round-trips them", () => {
    for (const value of ["=HYPERLINK(\"x\")", "+1 555", "-2", "@SUM(A1)"]) {
      expect(protectFormula(value)).toBe(`'${value}`);
      expect(unprotectFormula(protectFormula(value))).toBe(value);
    }
    expect(protectFormula("plain")).toBe("plain");
    // A real leading apostrophe that is not protecting a formula is left alone.
    expect(unprotectFormula("'90s style")).toBe("'90s style");
    expect(parseCsv(toCsv([["=1+1"]]))).toEqual([["'=1+1"]]);
  });
});

describe("reading the import file", () => {
  it("rejects spreadsheet formats, empty files, and oversized files", () => {
    expect(() => checkImportFile({ name: "tracker.xlsx", size: 100 })).toThrow(/not a CSV/);
    expect(() => checkImportFile({ name: "tracker.csv", size: 0 })).toThrow(/empty/);
    expect(() => checkImportFile({ name: "tracker.csv", size: 2 * 1024 * 1024 })).toThrow(/larger than 1 MB/);
    expect(() => checkImportFile({ name: "tracker.csv", size: 10 })).not.toThrow();
  });

  it("needs a header and at least one row", () => {
    expect(() => readImportTable("")).toThrow(ImportFileError);
    expect(() => readImportTable("Company,Role\n")).toThrow(/only has a header row/);
  });

  it("caps the number of rows", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Co ${i},Dev`).join("\n");
    expect(() => readImportTable(`Company,Role\n${rows}`)).toThrow(/501 rows/);
  });

  it("names blank and repeated headers, and widens to the longest row", () => {
    const table = readImportTable("Company,,Notes,notes\nAcme,x,a,b,extra\n");
    expect(table.headers).toEqual([
      "Company",
      "Column (column 2)",
      "Notes",
      "notes (column 4)",
      "Column (column 5)",
    ]);
  });

  it("turns a parse error into a file error", () => {
    expect(() => readImportTable('Company\n"Acme')).toThrow(ImportFileError);
  });
});

describe("guessColumnMapping", () => {
  it("maps common tracker headers", () => {
    const mapping = guessColumnMapping([
      "Company Name",
      "Position",
      "Current Status",
      "Date Applied",
      "Follow Up",
      "City",
      "Work Mode",
      "Link",
      "Comments",
    ]);
    expect(mapping).toEqual({
      company: 0,
      title: 1,
      status: 2,
      dateApplied: 3,
      followUpDate: 4,
      location: 5,
      workplaceType: 6,
      jobUrl: 7,
      notes: 8,
    });
  });

  it("recognizes every header it exports", () => {
    const csv = exportTrackerCsv([]);
    const headers = parseCsv(csv)[0];
    const mapping = guessColumnMapping(headers);
    IMPORT_FIELDS.forEach((field, index) => expect(mapping[field]).toBe(index));
  });

  it("does not let generic words grab unrelated columns", () => {
    const mapping = guessColumnMapping(["Company", "Company URL", "Applied (Y/N)", "Job Title", "Salary"]);
    expect(mapping.company).toBe(0);
    expect(mapping.jobUrl).toBeNull();
    expect(mapping.dateApplied).toBeNull();
    expect(mapping.title).toBe(3);
  });

  it("uses each column at most once and prefers exact matches", () => {
    const mapping = guessColumnMapping(["Status notes", "Status"]);
    expect(mapping.status).toBe(1);
    expect(mapping.notes).toBe(0);
  });

  it("lists missing required fields", () => {
    expect(missingRequiredFields(emptyColumnMapping())).toEqual(["company", "title"]);
    expect(missingRequiredFields(guessColumnMapping(["Company", "Role"]))).toEqual([]);
  });
});

describe("parseImportDate", () => {
  it("reads ISO dates and timestamps the same in either order", () => {
    for (const format of ["mdy", "dmy"] as const) {
      expect(parseImportDate("2025-03-04", format)).toBe("2025-03-04");
      expect(parseImportDate("2025/3/4", format)).toBe("2025-03-04");
      expect(parseImportDate("2025-03-04T18:30:00Z", format)).toBe("2025-03-04");
      expect(parseImportDate("Mar 4, 2025", format)).toBe("2025-03-04");
      expect(parseImportDate("Tuesday, March 4th, 2025", format)).toBe("2025-03-04");
      expect(parseImportDate("4 March 2025", format)).toBe("2025-03-04");
      expect(parseImportDate("04-Mar-25", format)).toBe("2025-03-04");
    }
  });

  it("reads slash dates in the chosen order", () => {
    expect(parseImportDate("3/4/2025", "mdy")).toBe("2025-03-04");
    expect(parseImportDate("3/4/2025", "dmy")).toBe("2025-04-03");
    expect(parseImportDate("14.03.2025", "dmy")).toBe("2025-03-14");
    expect(parseImportDate("3/14/25", "mdy")).toBe("2025-03-14");
    expect(parseImportDate("3/14/2025 10:00 AM", "mdy")).toBe("2025-03-14");
  });

  it("rejects non-dates and impossible dates", () => {
    expect(parseImportDate("", "mdy")).toBeNull();
    expect(parseImportDate("last week", "mdy")).toBeNull();
    expect(parseImportDate("2025-02-30", "mdy")).toBeNull();
    expect(parseImportDate("14/3/2025", "mdy")).toBeNull();
    expect(parseImportDate("45730", "mdy")).toBeNull();
    expect(parseImportDate("Marchish 4, 2025", "mdy")).toBeNull();
  });
});

describe("detectDateFormat", () => {
  const rows = (values: string[]) => values.map((value) => [value]);

  it("picks day first when a first number is above 12", () => {
    expect(detectDateFormat(rows(["3/4/2025", "25/4/2025"]), [0])).toEqual({ format: "dmy", ambiguous: false });
  });

  it("picks month first when a second number is above 12", () => {
    expect(detectDateFormat(rows(["3/4/2025", "4/25/2025"]), [0])).toEqual({ format: "mdy", ambiguous: false });
  });

  it("flags all-ambiguous dates and ignores ISO dates", () => {
    expect(detectDateFormat(rows(["3/4/2025"]), [0])).toEqual({ format: "mdy", ambiguous: true });
    expect(detectDateFormat(rows(["2025-03-25"]), [0])).toEqual({ format: "mdy", ambiguous: false });
    expect(detectDateFormat(rows(["3/4/2025"]), [null])).toEqual({ format: "mdy", ambiguous: false });
  });
});

describe("statuses, workplace, and links", () => {
  it("reads tracker labels, raw values, and common wording", () => {
    expect(parseImportStatus("Applied")).toBe("applied");
    expect(parseImportStatus(" INTERVIEWING ")).toBe("interviewing");
    expect(parseImportStatus("Recruiter screen")).toBe("recruiter_screen");
    expect(parseImportStatus("ready_to_apply")).toBe("ready_to_apply");
    expect(parseImportStatus("Phone screen")).toBe("recruiter_screen");
    expect(parseImportStatus("Wishlist")).toBe("saved");
    expect(parseImportStatus("Offer received")).toBe("offer");
    expect(parseImportStatus("Not selected")).toBe("rejected");
    expect(parseImportStatus("Ghosted")).toBeNull();
    expect(parseImportStatus("")).toBeNull();
  });

  it("reads workplace types", () => {
    expect(parseImportWorkplace("Remote")).toBe("remote");
    expect(parseImportWorkplace("On-site")).toBe("on_site");
    expect(parseImportWorkplace("in office")).toBe("on_site");
    expect(parseImportWorkplace("Hybrid")).toBe("hybrid");
    expect(parseImportWorkplace("Sometimes")).toBeNull();
  });

  it("accepts bare web links and rejects everything else", () => {
    expect(parseImportUrl("https://jobs.example.com/1")).toBe("https://jobs.example.com/1");
    expect(parseImportUrl("www.example.com/jobs/2")).toBe("https://www.example.com/jobs/2");
    expect(parseImportUrl("javascript:alert(1)")).toBeNull();
    expect(parseImportUrl("mailto:hr@example.com")).toBeNull();
    expect(parseImportUrl("TBD")).toBeNull();
    expect(parseImportUrl("")).toBeNull();
  });

  it("compares links without tracking parameters, fragments, or trailing slashes", () => {
    expect(jobUrlKey("https://www.Example.com/jobs/1/?utm_source=x#apply")).toBe("example.com/jobs/1");
    // Greenhouse puts the job id in the query string, so real parameters are kept.
    expect(jobUrlKey("https://example.com/careers?gh_jid=42&utm_medium=y")).toBe("example.com/careers?gh_jid=42");
  });
});

function tableOf(csv: string) {
  const table = readImportTable(csv);
  return { table, mapping: guessColumnMapping(table.headers) };
}

function rowsOf(csv: string, dateFormat: "mdy" | "dmy" = "mdy"): ImportRowResult[] {
  const { table, mapping } = tableOf(csv);
  return normalizeImportRows(table, mapping, dateFormat);
}

describe("normalizeImportRows", () => {
  it("numbers rows as the spreadsheet does and normalizes values", () => {
    const [row] = rowsOf(
      [
        "Company,Role,Status,Date applied,Follow-up date,Location,Workplace,Job URL,Notes",
        "  Acme   Corp ,Frontend  Dev,Interview,3/14/2025,2025-04-01,Toronto,Hybrid,acme.com/jobs/1,Met the team",
      ].join("\n")
    );
    expect(row).toEqual({
      rowNumber: 2,
      error: null,
      missing: [],
      warnings: [],
      values: {
        company: "Acme Corp",
        title: "Frontend Dev",
        status: "interviewing",
        statusFromFile: true,
        dateApplied: "2025-03-14",
        followUpDate: "2025-04-01",
        location: "Toronto",
        workplaceType: "hybrid",
        jobUrl: "https://acme.com/jobs/1",
        notes: "Met the team",
      },
    });
  });

  it("skips rows without a company or role, and says which is missing", () => {
    const rows = rowsOf("Company,Role\n,Dev\nAcme,\n,,\nGlobex,Dev\n");
    expect(rows.map((row) => [row.rowNumber, row.error])).toEqual([
      [2, "Missing company"],
      [3, "Missing role"],
      // Row 4 is empty in the spreadsheet, so Globex is row 5.
      [5, null],
    ]);
  });

  it("infers a missing status from the applied date", () => {
    const rows = rowsOf("Company,Role,Date applied\nA,Dev,2025-01-02\nB,Dev,\n");
    expect(rows.map((row) => [row.values?.status, row.values?.statusFromFile])).toEqual([
      ["applied", false],
      ["saved", false],
    ]);
    expect(rows.every((row) => row.warnings.length === 0)).toBe(true);
  });

  it("imports rows with unreadable values and explains what was dropped", () => {
    const [row] = rowsOf(
      "Company,Role,Status,Date applied,Workplace,Job URL\nA,Dev,Ghosted,last week,Sometimes,TBD\n"
    );
    expect(row.values).toMatchObject({
      status: "saved",
      statusFromFile: false,
      dateApplied: null,
      workplaceType: null,
      jobUrl: null,
    });
    // Each message belongs to a field, so the preview can show it next to the right input.
    expect(row.warnings).toEqual([
      { field: "dateApplied", message: 'Date applied "last week" is not a date we can read, so it was left blank' },
      { field: "status", message: 'Status "Ghosted" is not one we track, so it was imported as Saved' },
      {
        field: "workplaceType",
        message: 'Workplace "Sometimes" is not Remote, Hybrid, or On-site, so it was left blank',
      },
      { field: "jobUrl", message: '"TBD" is not a web link, so the job URL was left blank' },
    ]);
  });

  it("shortens values that are too long", () => {
    const notes = "x".repeat(8100);
    const [row] = rowsOf(`Company,Role,Notes\nA,Dev,${notes}\n`);
    expect(row.values?.notes).toHaveLength(8000);
    expect(row.warnings).toEqual([{ field: "notes", message: "Notes was shortened to 8000 characters" }]);
  });

  it("uses the chosen date order", () => {
    const csv = "Company,Role,Date applied\nA,Dev,4/3/2025\n";
    expect(rowsOf(csv, "mdy")[0].values?.dateApplied).toBe("2025-04-03");
    expect(rowsOf(csv, "dmy")[0].values?.dateApplied).toBe("2025-03-04");
  });

  it("reports spreadsheet row numbers even with empty rows in between", () => {
    const { table, mapping } = tableOf("Company,Role\nAcme,Dev\n,\n,\nGlobex,\n");
    const rows = normalizeImportRows(table, mapping, "mdy");
    expect(rows.map((row) => [row.rowNumber, row.error])).toEqual([
      [2, null],
      [5, "Missing role"],
    ]);
    expect(tableRowFor(table, 5)).toEqual(["Globex", ""]);
  });

  it("ignores unmapped columns", () => {
    const { table } = tableOf("Company,Role,Salary\nA,Dev,100k\n");
    const mapping: ColumnMapping = { ...emptyColumnMapping(), company: 0, title: 1 };
    const [row] = normalizeImportRows(table, mapping, "mdy");
    expect(row.values).toMatchObject({ company: "A", title: "Dev", notes: null });
  });
});

describe("editing rows in the preview", () => {
  const csv = [
    "Company,Role,Status,Date applied,Workplace,Job URL,Notes",
    ",Frontend Developer,Applied,2025-03-01,Remote,TBD,",
    "Acme,Dev,Ghosted,next week,Flexible,acme.example.com/jobs/1,'=Referral",
  ].join("\n");

  function rowsWith(edits: Parameters<typeof normalizeImportRows>[3]) {
    const { table, mapping } = tableOf(csv);
    return normalizeImportRows(table, mapping, "mdy", edits);
  }

  it("checks every field of a row it will skip, so fixing it shows what else needs attention", () => {
    const [skipped] = rowsWith({});
    expect(skipped).toMatchObject({ values: null, error: "Missing company", missing: ["company"] });
    expect(skipped.warnings.map((issue) => issue.field)).toEqual(["jobUrl"]);
  });

  it("an edit fills in a missing value, and the row is checked again", () => {
    const [fixed] = rowsWith({ 2: { company: "  Globex  " } });
    expect(fixed).toMatchObject({ error: null, missing: [], values: { company: "Globex", status: "applied" } });
    expect(fixed.warnings.map((issue) => issue.field)).toEqual(["jobUrl"]);
  });

  it("edits replace unreadable values, and clearing a value drops its note", () => {
    const [, row] = rowsWith({
      3: { status: "interviewing", dateApplied: "2025-03-14", workplaceType: "on_site", jobUrl: "" },
    });
    expect(row.warnings).toEqual([]);
    expect(row.values).toMatchObject({
      status: "interviewing",
      statusFromFile: true,
      dateApplied: "2025-03-14",
      workplaceType: "on_site",
      jobUrl: null,
    });
  });

  it("edits go through the same checks as the file", () => {
    const [, row] = rowsWith({ 3: { jobUrl: "javascript:alert(1)", dateApplied: "soon" } });
    expect(row.values).toMatchObject({ jobUrl: null, dateApplied: null });
    expect(row.warnings.map((issue) => issue.field)).toEqual(["dateApplied", "status", "workplaceType", "jobUrl"]);
  });

  it("edits are text as typed: no formula unprotecting, and ISO dates read the same in either order", () => {
    const { table, mapping } = tableOf(csv);
    // The file's protected formula is read back without its apostrophe...
    expect(rawImportValue(table, mapping, 3, "notes")).toBe("=Referral");
    // ...but an apostrophe the visitor types is theirs to keep.
    const [, typed] = normalizeImportRows(table, mapping, "dmy", { 3: { notes: "'=Keep", dateApplied: "2025-03-04" } });
    expect(typed.values).toMatchObject({ notes: "'=Keep", dateApplied: "2025-03-04" });
  });

  it("keeps only real changes, and can drop a row's edits", () => {
    let edits = withImportEdit({}, 3, "status", "offer", "Ghosted");
    edits = withImportEdit(edits, 3, "notes", "Hi", "");
    expect(edits).toEqual({ 3: { status: "offer", notes: "Hi" } });
    // Typing the file's value back is not an edit.
    edits = withImportEdit(edits, 3, "status", "Ghosted", "Ghosted");
    expect(edits).toEqual({ 3: { notes: "Hi" } });
    edits = withImportEdit(edits, 3, "notes", "", "");
    expect(edits).toEqual({});
    const twoRows = withImportEdit(withImportEdit({}, 2, "company", "A", ""), 3, "company", "B", "Acme");
    expect(withoutImportEdits(twoRows, 2)).toEqual({ 3: { company: "B" } });
    expect(withoutImportEdits(twoRows, 9)).toBe(twoRows);
  });

  it("edited rows are matched for duplicates like any other", () => {
    const existing = [{ id: "app-1", companyName: "Globex", title: "Frontend Developer", jobUrl: null }];
    const rows = rowsWith({ 2: { company: "Globex" } });
    expect(findImportDuplicates(rows, existing).get(2)).toMatchObject({ kind: "existing" });
  });
});

describe("findImportDuplicates and planImport", () => {
  const existing = [
    { id: "app-1", companyName: "Acme Inc.", title: "Frontend Developer", jobUrl: null },
    { id: "app-2", companyName: "Globex", title: "Engineer", jobUrl: "https://globex.com/jobs/7" },
  ];

  it("matches on company and role, ignoring case, punctuation, and legal suffixes", () => {
    const rows = rowsOf("Company,Role\nACME,frontend developer\nAcme,Backend Developer\n");
    const duplicates = findImportDuplicates(rows, existing);
    expect(duplicates.get(2)).toEqual({ kind: "existing", application: existing[0] });
    expect(duplicates.has(3)).toBe(false);
  });

  it("matches on the job link, and treats different links as different postings", () => {
    const rows = rowsOf(
      [
        "Company,Role,Job URL",
        "Globex Corporation,Senior Engineer,https://globex.com/jobs/7?utm_source=sheet",
        "Globex,Engineer,https://globex.com/jobs/8",
      ].join("\n")
    );
    const duplicates = findImportDuplicates(rows, existing);
    expect(duplicates.get(2)).toMatchObject({ kind: "existing", application: { id: "app-2" } });
    expect(duplicates.has(3)).toBe(false);
  });

  it("matches repeated rows in the same file before the tracker", () => {
    const rows = rowsOf("Company,Role\nAcme,Frontend Developer\nacme,Frontend developer\n,missing\n");
    const duplicates = findImportDuplicates(rows, existing);
    expect(duplicates.get(2)).toMatchObject({ kind: "existing" });
    expect(duplicates.get(3)).toEqual({ kind: "file", rowNumber: 2 });
    expect(duplicates.has(4)).toBe(false);
  });

  it("plans each row from the visitor's choices, skipping duplicates by default", () => {
    const rows = rowsOf("Company,Role\nAcme,Frontend Developer\nNew Co,Dev\n,Dev\nNew Co,Dev\n");
    const duplicates = findImportDuplicates(rows, existing);
    const defaults = planImport(rows, duplicates, {});
    expect(defaults.map((item) => item.action)).toEqual(["skip", "add", "skip", "skip"]);
    expect(summarizePlan(defaults)).toEqual({ add: 1, update: 0, skipInvalid: 1, skipDuplicate: 2 });

    const chosen = planImport(rows, duplicates, { 2: "update", 5: "keep_both" });
    expect(chosen[0]).toMatchObject({ action: "update", applicationId: "app-1" });
    expect(chosen[3]).toMatchObject({ action: "add" });
    expect(summarizePlan(chosen)).toEqual({ add: 2, update: 1, skipInvalid: 1, skipDuplicate: 0 });
  });

  it("never updates from a repeated file row", () => {
    expect(resolutionFor({ kind: "file", rowNumber: 2 }, "update")).toBe("skip");
    expect(resolutionFor({ kind: "existing", application: existing[0] }, "update")).toBe("update");
  });
});

describe("exportTrackerCsv", () => {
  const base: TrackedApplication = {
    id: "a",
    jobId: "j",
    status: "recruiter_screen",
    stage: "interviewing",
    notes: "=cmd|' /C calc'!A0\nsecond line",
    dateApplied: "2025-03-14T12:00:00.000Z",
    followUpDate: null,
    lastActivityAt: "2025-03-15T12:00:00.000Z",
    companyName: "Zeta, Inc.",
    title: "Engineer",
    jobUrl: "https://zeta.example.com/jobs/1",
    location: "Toronto, ON",
    workplaceType: "on_site",
    locationLabel: "Toronto, ON · On-site",
    fitScore: 80,
    attention: [],
  };

  it("writes a header and one sorted row per application", () => {
    const csv = exportTrackerCsv([
      base,
      { ...base, id: "b", companyName: "alpha", title: "Dev", notes: null, jobUrl: null, workplaceType: null, location: null, status: "saved", dateApplied: null },
    ]);
    expect(parseCsv(csv)).toEqual([
      ["Company", "Role", "Status", "Date applied", "Follow-up date", "Location", "Workplace", "Job URL", "Notes"],
      ["alpha", "Dev", "Saved", "", "", "", "", "", ""],
      [
        "Zeta, Inc.",
        "Engineer",
        "Recruiter screen",
        "2025-03-14",
        "",
        "Toronto, ON",
        "On-site",
        "https://zeta.example.com/jobs/1",
        "'=cmd|' /C calc'!A0\nsecond line",
      ],
    ]);
  });

  it("imports back to the same values", () => {
    const [row] = rowsOf(exportTrackerCsv([base]));
    expect(row.warnings).toEqual([]);
    expect(row.values).toEqual({
      company: "Zeta, Inc.",
      title: "Engineer",
      status: "recruiter_screen",
      statusFromFile: true,
      dateApplied: "2025-03-14",
      followUpDate: null,
      location: "Toronto, ON",
      workplaceType: "on_site",
      jobUrl: "https://zeta.example.com/jobs/1",
      notes: "=cmd|' /C calc'!A0\nsecond line",
    });
  });

  it("names the file for the local date", () => {
    expect(exportFileName(new Date(2025, 2, 4, 23, 30))).toBe("job-applications-2025-03-04.csv");
  });
});
