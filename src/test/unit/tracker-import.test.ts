import { describe, expect, it } from "vitest";
import { decodeCsvBytes, hasControlCharacters, stripControlCharacters } from "@/modules/applications/csv";
import { describeImportFailure } from "@/modules/applications/import-store";
import { describeEvent } from "@/modules/applications/tracker";
import {
  guessColumnMapping,
  normalizeImportRows,
  readImportTable,
  type ImportValues,
} from "@/modules/applications/tracker-csv";
import {
  buildImportRequest,
  ImportRequestError,
  parseImportRequest,
  planTrackedUpdate,
  type ImportCandidate,
} from "@/modules/applications/tracker-import";
import { IMPORTED_JOB_PIPELINE_STATUS, isImportedJob } from "@/modules/jobs/imported-jobs";

const ID = "3f1c7a52-2b8e-4a8e-9a59-6a3f7b1c2d4e";

const VALUES: ImportValues = {
  company: "Acme",
  title: "Frontend Developer",
  status: "applied",
  statusFromFile: true,
  dateApplied: "2025-03-14",
  followUpDate: null,
  location: "Toronto, ON",
  workplaceType: "hybrid",
  jobUrl: "https://acme.example.com/jobs/1",
  notes: "Line one\nline two",
};

function request(overrides: Record<string, unknown> = {}, values: Record<string, unknown> = {}) {
  return {
    importId: ID,
    fileName: "tracker.csv",
    rows: [{ rowNumber: 2, values: { ...VALUES, ...values } }],
    resolutions: {},
    ...overrides,
  };
}

function rejects(input: unknown, message: RegExp) {
  expect(() => parseImportRequest(input)).toThrow(ImportRequestError);
  expect(() => parseImportRequest(input)).toThrow(message);
}

describe("buildImportRequest", () => {
  it("sends only rows that can be imported, and only their duplicate choices", () => {
    const table = readImportTable("Company,Role\nAcme,Dev\n,Missing company\nGlobex,Eng\n");
    const rows = normalizeImportRows(table, guessColumnMapping(table.headers), "mdy");
    const built = buildImportRequest(ID, "file.csv", rows, { 2: "update", 3: "keep_both", 99: "skip" });
    expect(built.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(built.resolutions).toEqual({ 2: "update" });
    // The server accepts what the dialog builds, unchanged.
    expect(parseImportRequest(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });
});

describe("parseImportRequest (untrusted input on the server)", () => {
  it("accepts a valid request as is", () => {
    expect(parseImportRequest(request())).toEqual({
      importId: ID,
      fileName: "tracker.csv",
      rows: [{ rowNumber: 2, values: VALUES }],
      resolutions: {},
    });
  });

  it("needs an id, rows, and no more than 500 of them", () => {
    rejects(null, /empty/);
    rejects(request({ importId: "not-a-uuid" }), /id/);
    rejects(request({ rows: [] }), /no rows/);
    const many = Array.from({ length: 501 }, (_, index) => ({ rowNumber: index + 2, values: VALUES }));
    rejects(request({ rows: many }), /up to 500 rows/);
  });

  it("rejects malformed or repeated row numbers", () => {
    rejects(request({ rows: [{ rowNumber: 0, values: VALUES }] }), /no row number/);
    rejects(request({ rows: [{ rowNumber: 2.5, values: VALUES }] }), /no row number/);
    rejects(request({ rows: [{ rowNumber: "2", values: VALUES }] }), /no row number/);
    rejects(
      request({ rows: [{ rowNumber: 2, values: VALUES }, { rowNumber: 2, values: VALUES }] }),
      /appears twice/
    );
  });

  it("applies the same limits as the file parser, naming the row", () => {
    rejects(request({}, { company: "   " }), /Row 2: company is missing/);
    rejects(request({}, { title: 5 }), /Row 2: role is missing/);
    rejects(request({}, { company: "x".repeat(161) }), /Row 2: company must be 160 characters or fewer/);
    rejects(request({}, { title: "x".repeat(201) }), /role must be 200/);
    rejects(request({}, { location: "x".repeat(201) }), /location must be 200/);
    rejects(request({}, { notes: "x".repeat(8001) }), /notes must be 8000/);
    rejects(request({}, { status: "hired" }), /status is not one we track/);
    rejects(request({}, { workplaceType: "moon" }), /workplace/);
    rejects(request({}, { dateApplied: "03/14/2025" }), /date applied must be a date/);
    rejects(request({}, { dateApplied: "2025-02-30" }), /date applied must be a date/);
    rejects(request({}, { followUpDate: "1850-01-01" }), /between 1900 and 2200/);
  });

  it("only accepts web links", () => {
    for (const jobUrl of ["javascript:alert(1)", "mailto:a@b.com", "ftp://x.example.com", "TBD", 42]) {
      rejects(request({}, { jobUrl }), /not a web link/);
    }
    expect(parseImportRequest(request({}, { jobUrl: null })).rows[0].values.jobUrl).toBeNull();
    expect(parseImportRequest(request({}, { jobUrl: "" })).rows[0].values.jobUrl).toBeNull();
  });

  it("cleans text the way the file parser does: control characters out, single-line fields collapsed", () => {
    const parsed = parseImportRequest(
      request(
        { fileName: "my\u0000file.csv" },
        { company: "  Acme\u0000\n  Corp ", location: "", notes: "keep\nlines\u0007", statusFromFile: "yes" }
      )
    );
    expect(parsed.fileName).toBe("myfile.csv");
    expect(parsed.rows[0].values).toMatchObject({
      company: "Acme Corp",
      location: null,
      notes: "keep\nlines",
      // Only a real boolean counts; anything else is treated as a guessed status.
      statusFromFile: false,
    });
  });

  it("keeps only valid duplicate choices for rows in the request", () => {
    const parsed = parseImportRequest(request({ resolutions: { 2: "update", 7: "keep_both" } }));
    expect(parsed.resolutions).toEqual({ 2: "update" });
    rejects(request({ resolutions: { 2: "delete" } }), /duplicate choice is not valid/);
    rejects(request({ resolutions: "skip" }), /Duplicate choices are not valid/);
  });

  it("ignores fields it does not know, including application ids", () => {
    const parsed = parseImportRequest({
      ...request(),
      rows: [{ rowNumber: 2, values: { ...VALUES, id: "someone-else" }, applicationId: "x" }],
      userId: "other",
    });
    expect(parsed.rows[0]).toEqual({ rowNumber: 2, values: VALUES });
    expect(parsed).not.toHaveProperty("userId");
  });
});

describe("planTrackedUpdate", () => {
  const candidate: ImportCandidate = {
    id: "app-1",
    companyName: "Acme",
    title: "Frontend Developer",
    jobUrl: null,
    status: "applied",
    dateApplied: "2025-03-14T16:20:00.000Z",
    followUpDate: null,
    notes: "Old note",
    location: "Toronto, ON",
    workplaceType: "hybrid",
    jobDetailsEditable: true,
  };

  it("lists each change, and changes nothing for equal values or blanks", () => {
    const update = planTrackedUpdate(candidate, {
      ...VALUES,
      status: "offer",
      // Same calendar day as the stored timestamp: not a change.
      dateApplied: "2025-03-14",
      followUpDate: "2025-06-30",
      notes: null,
      location: null,
      workplaceType: "remote",
    });
    expect(update.application).toEqual({ status: "offer", followUpDate: "2025-06-30" });
    expect(update.job).toEqual({ workplaceType: "remote", jobUrl: "https://acme.example.com/jobs/1" });
    expect(update.changes.map((change) => `${change.label}: ${change.before} → ${change.after}`)).toEqual([
      "Status: Applied → Offer",
      "Follow-up: — → Jun 30, 2025",
      "Location: Toronto, ON · Hybrid → Toronto, ON · Remote",
      "Job URL: — → https://acme.example.com/jobs/1",
    ]);
  });

  it("never writes a guessed status", () => {
    expect(planTrackedUpdate(candidate, { ...VALUES, status: "saved", statusFromFile: false }).application).not.toHaveProperty(
      "status"
    );
  });

  it("leaves a discovered job's details alone", () => {
    const update = planTrackedUpdate(
      { ...candidate, jobDetailsEditable: false },
      { ...VALUES, location: "Mars", workplaceType: "remote" }
    );
    expect(update.job).toEqual({});
    expect(update.changes.map((change) => change.field)).not.toContain("location");
  });
});

describe("reading files safely", () => {
  it("reads Excel's UTF-16 'Unicode Text' export", () => {
    const text = "Company\tRole\r\nCafé\tDév\r\n";
    const le = new Uint8Array([0xff, 0xfe, ...Array.from(text).flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])]);
    const be = new Uint8Array([0xfe, 0xff, ...Array.from(text).flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff])]);
    expect(decodeCsvBytes(le)).toBe(text);
    expect(decodeCsvBytes(be)).toBe(text);
    const table = readImportTable(decodeCsvBytes(le));
    expect(table.rows).toEqual([["Café", "Dév"]]);
  });

  it("removes control characters (Postgres rejects NUL) but keeps tabs and line breaks", () => {
    expect(stripControlCharacters("a\u0000b\u0007c\td\ne\r\nf\u007f")).toBe("abc\td\ne\r\nf");
    expect(hasControlCharacters("ok\ttab\nline")).toBe(false);
    expect(hasControlCharacters("bad\u0000")).toBe(true);
    const table = readImportTable("Company,Role,Notes\nAc\u0000me,Dev,\"two\u0001\nlines\"\n");
    const [row] = normalizeImportRows(table, guessColumnMapping(table.headers), "mdy");
    expect(row.values).toMatchObject({ company: "Acme", notes: "two\nlines" });
  });
});

describe("import history and failures", () => {
  it("describes imported and updated applications", () => {
    expect(
      describeEvent({
        eventType: "spreadsheet_imported",
        notes: null,
        payload: { kind: "spreadsheet_import", importId: ID, action: "add", fileName: "tracker.csv", rowNumber: 4 },
      })
    ).toEqual({ title: "Imported from spreadsheet", detail: "From tracker.csv, row 4" });
    expect(
      describeEvent({
        eventType: "spreadsheet_updated",
        notes: null,
        payload: {
          kind: "spreadsheet_import",
          action: "update",
          fileName: "",
          rowNumber: 0,
          changes: [{ field: "status", label: "Status", before: "Applied", after: "Offer" }, "junk"],
        },
      })
    ).toEqual({ title: "Updated from spreadsheet", detail: "Status: Applied → Offer" });
  });

  it("turns database errors into messages that say nothing was imported", () => {
    expect(describeImportFailure({ code: "55P03" })).toMatch(/Another import is still saving/);
    expect(describeImportFailure(Object.assign(new Error("x"), { code: "57014" }))).toMatch(/took too long/);
    expect(describeImportFailure(new Error("wrapped", { cause: { code: "22P05" } }))).toMatch(/characters/);
    expect(describeImportFailure(new Error('invalid input value for enum application_status: "offer"'))).toMatch(
      /migration 0015/
    );
    for (const error of [new Error("boom"), "string", null]) {
      expect(describeImportFailure(error)).toBe(
        "The import could not be saved, so nothing was imported. Try again in a moment."
      );
    }
  });

  it("recognizes imported jobs", () => {
    expect(isImportedJob({ matchPipelineStatus: IMPORTED_JOB_PIPELINE_STATUS })).toBe(true);
    expect(isImportedJob({ matchPipelineStatus: "manual" })).toBe(false);
    expect(isImportedJob({ matchPipelineStatus: null })).toBe(false);
  });
});
