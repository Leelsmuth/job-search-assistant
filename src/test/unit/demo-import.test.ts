import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCsvBytes } from "@/modules/applications/csv";
import {
  IMPORT_FIELDS,
  detectDateFormat,
  missingRequiredFields,
  exportTrackerCsv,
  guessColumnMapping,
  importTemplateCsv,
  normalizeImportRows,
  readImportTable,
  type DuplicateResolution,
} from "@/modules/applications/tracker-csv";
import {
  MAX_DEMO_IMPORTED_APPLICATIONS,
  findDemoImportDuplicates,
  importIntoDemo,
  previewDemoUpdate,
} from "@/modules/demo/demo-import";
import {
  createDemoState,
  demoApplicationId,
  isDemoStatePristine,
  listDemoTrackedApplications,
  parseDemoState,
  selectDemoFeed,
  setDemoApplicationNotes,
  setDemoApplicationStatus,
  DEFAULT_DEMO_FEED_FILTERS,
  type DemoState,
} from "@/modules/demo/demo-state";

const NOW = new Date("2025-06-10T15:00:00.000Z");
const LATER = new Date("2025-06-11T09:00:00.000Z");

const HEADER = "Company,Role,Status,Date applied,Follow-up date,Location,Workplace,Job URL,Notes";

function rows(csv: string) {
  const table = readImportTable(csv);
  return normalizeImportRows(table, guessColumnMapping(table.headers), "mdy");
}

function importCsv(
  state: DemoState,
  csv: string,
  resolutions: Record<number, DuplicateResolution> = {},
  now = LATER
) {
  return importIntoDemo(state, rows(csv), resolutions, now);
}

function tracked(state: DemoState, company: string) {
  return listDemoTrackedApplications(state, LATER).filter((app) => app.companyName === company);
}

describe("importing into the demo", () => {
  it("adds rows as applications the tracker shows like any other", () => {
    const { state, summary } = importCsv(
      createDemoState(NOW),
      [
        HEADER,
        "Acme,Frontend Developer,Interviewing,2025-05-01,2025-06-20,Toronto,Hybrid,https://acme.example.com/jobs/1,Met the team",
        "Globex,Engineer,,,,,,,",
      ].join("\n")
    );
    expect(summary).toEqual({ add: 2, update: 0, unchanged: 0, skipInvalid: 0, skipDuplicate: 0 });
    expect(state.applications).toHaveLength(4);

    const [acme] = tracked(state, "Acme");
    expect(acme).toMatchObject({
      id: demoApplicationId("import-1"),
      jobId: "import-1",
      title: "Frontend Developer",
      status: "interviewing",
      stage: "interviewing",
      dateApplied: "2025-05-01T12:00:00.000Z",
      followUpDate: "2025-06-20T12:00:00.000Z",
      jobUrl: "https://acme.example.com/jobs/1",
      locationLabel: "Toronto · Hybrid",
      notes: "Met the team",
      fitScore: null,
      // The applied date is the last known activity.
      lastActivityAt: "2025-05-01T12:00:00.000Z",
    });
    const [globex] = tracked(state, "Globex");
    expect(globex).toMatchObject({
      jobId: "import-2",
      status: "saved",
      dateApplied: null,
      locationLabel: "Location not set",
      lastActivityAt: LATER.toISOString(),
    });
  });

  it("flags an imported role applied to long ago as stale", () => {
    const { state } = importCsv(createDemoState(NOW), `${HEADER}\nAcme,Dev,Applied,2025-04-01,,,,,`);
    expect(tracked(state, "Acme")[0].attention).toEqual(["stale_applied"]);
  });

  it("makes the demo non-pristine and survives storage", () => {
    const { state } = importCsv(createDemoState(NOW), `${HEADER}\nAcme,Dev,,,,,Remote,,`);
    expect(isDemoStatePristine(state)).toBe(false);
    expect(parseDemoState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("keeps numbering imported jobs after earlier imports", () => {
    const first = importCsv(createDemoState(NOW), `${HEADER}\nA,Dev,,,,,,,\nB,Dev,,,,,,,`).state;
    const second = importCsv(first, `${HEADER}\nC,Dev,,,,,,,`).state;
    expect(second.applications.map((app) => app.jobId).slice(-3)).toEqual([
      "import-1",
      "import-2",
      "import-3",
    ]);
  });

  it("skips invalid rows and returns the same state when nothing is added", () => {
    const state = createDemoState(NOW);
    const result = importCsv(state, `${HEADER}\n,Dev,,,,,,,`);
    expect(result.summary).toMatchObject({ add: 0, skipInvalid: 1 });
    expect(result.state).toBe(state);
  });

  it("attaches a row naming an untracked sample job to that job", () => {
    const state = createDemoState(NOW);
    const { state: next } = importCsv(state, `${HEADER}\nNorthwind Labs,Senior Frontend Engineer,Applied,2025-06-01,,,,,From my sheet`);
    const app = next.applications.find((candidate) => candidate.jobId === "northwind-senior-frontend");
    expect(app).toMatchObject({ id: demoApplicationId("northwind-senior-frontend"), status: "applied", notes: "From my sheet" });
    expect(app?.job).toBeUndefined();
    expect(next.savedJobIds).toContain("northwind-senior-frontend");
    const feed = selectDemoFeed(next, DEFAULT_DEMO_FEED_FILTERS).items;
    expect(feed.find((item) => item.job.id === "northwind-senior-frontend")?.trackedStatus).toBe("applied");
  });

  it("refuses to grow past the imported application limit", () => {
    const many = Array.from({ length: MAX_DEMO_IMPORTED_APPLICATIONS }, (_, i) => `Co ${i},Dev,,,,,,,`);
    const full = importCsv(createDemoState(NOW), [HEADER, ...many].join("\n")).state;
    expect(() => importCsv(full, `${HEADER}\nOne more,Dev,,,,,,,`)).toThrow(/up to 500/);
  });
});

describe("duplicates in the demo", () => {
  // The seed tracks Harbourline (applied) and Civic Form (interviewing).
  function seededTitle() {
    const app = listDemoTrackedApplications(createDemoState(NOW), NOW).find((candidate) =>
      candidate.companyName.startsWith("Harbourline")
    )!;
    return { company: app.companyName, title: app.title, id: app.id };
  }

  it("finds rows that match tracked sample jobs", () => {
    const { company, title, id } = seededTitle();
    const found = findDemoImportDuplicates(createDemoState(NOW), rows(`Company,Role\n"${company}","${title}"`));
    expect(found.get(2)).toMatchObject({ kind: "existing", application: { id } });
  });

  it("skips by default, and keep both adds a separate application", () => {
    const { company, title } = seededTitle();
    const csv = `Company,Role,Status\n"${company}","${title}",Offer`;
    const skipped = importCsv(createDemoState(NOW), csv);
    expect(skipped.summary).toMatchObject({ add: 0, skipDuplicate: 1 });

    const both = importCsv(createDemoState(NOW), csv, { 2: "keep_both" });
    expect(both.summary).toMatchObject({ add: 1 });
    expect(tracked(both.state, company)).toHaveLength(2);
  });

  it("update writes non-blank values over a sample job's application", () => {
    const { company, title, id } = seededTitle();
    const before = createDemoState(NOW);
    const { state, summary } = importCsv(
      before,
      `Company,Role,Status,Follow-up date,Notes,Location\n"${company}","${title}",Offer,2025-06-30,,Mars`,
      { 2: "update" }
    );
    expect(summary).toMatchObject({ add: 0, update: 1, unchanged: 0 });
    const app = state.applications.find((candidate) => candidate.id === id)!;
    const original = before.applications.find((candidate) => candidate.id === id)!;
    expect(app).toMatchObject({
      status: "offer",
      followUpDate: "2025-06-30T12:00:00.000Z",
      // Blank notes do not erase, and a sample job's location is fixed.
      notes: original.notes,
      dateApplied: original.dateApplied,
      updatedAt: LATER.toISOString(),
    });
    expect(app.job).toBeUndefined();
  });

  it("previews exactly what update will change", () => {
    const { company, title, id } = seededTitle();
    const state = createDemoState(NOW);
    const [row] = rows(`Company,Role,Status,Follow-up date,Notes\n"${company}","${title}",Offer,2025-06-30,`);
    expect(previewDemoUpdate(state, id, row.values!, LATER)).toEqual([
      { field: "status", label: "Status", before: "Applied", after: "Offer" },
      { field: "followUpDate", label: "Follow-up", before: "—", after: "Jun 30, 2025" },
    ]);
    const [same] = rows(`Company,Role,Status\n"${company}","${title}",Applied`);
    expect(previewDemoUpdate(state, id, same.values!, LATER)).toEqual([]);
  });

  it("update does not overwrite a status it had to guess", () => {
    const { company, title, id } = seededTitle();
    const { state } = importCsv(createDemoState(NOW), `Company,Role,Status\n"${company}","${title}",Ghosted`, {
      2: "update",
    });
    expect(state.applications.find((candidate) => candidate.id === id)!.status).toBe("applied");
  });

  it("update changes an imported job's details and reports unchanged rows", () => {
    const first = importCsv(createDemoState(NOW), `${HEADER}\nAcme,Dev,Applied,2025-05-01,,Toronto,,,`).state;
    const updated = importCsv(first, `${HEADER}\nAcme,Dev,,,,Montreal,Remote,acme.example.com/1,`, { 2: "update" });
    expect(updated.summary).toMatchObject({ update: 1, unchanged: 0 });
    expect(tracked(updated.state, "Acme")[0]).toMatchObject({
      status: "applied",
      locationLabel: "Montreal · Remote",
      jobUrl: "https://acme.example.com/1",
    });

    const again = importCsv(updated.state, `${HEADER}\nAcme,Dev,,,,Montreal,,,`, { 2: "update" });
    expect(again.summary).toMatchObject({ update: 0, unchanged: 1 });
    expect(again.state).toBe(updated.state);
  });

  it("re-importing an export with update changes nothing, even for timestamped dates", () => {
    // Seeded applied dates carry a time of day; the export only has the calendar day.
    const state = createDemoState(NOW);
    const csv = exportTrackerCsv(listDemoTrackedApplications(state, NOW));
    const result = importCsv(state, csv, { 2: "update", 3: "update" });
    expect(result.summary).toMatchObject({ add: 0, update: 0, unchanged: 2 });
    expect(result.state).toBe(state);
  });

  it("matches against the state at import time, not when the preview was built", () => {
    const state = createDemoState(NOW);
    const csvRows = rows(`${HEADER}\nAcme,Dev,Applied,,,,,,`);
    const afterOtherTab = importIntoDemo(state, csvRows, {}, NOW).state;
    // Same rows again: now a duplicate, skipped by default rather than added twice.
    const result = importIntoDemo(afterOtherTab, csvRows, {}, LATER);
    expect(result.summary).toMatchObject({ add: 0, skipDuplicate: 1 });
  });
});

describe("export and import round trip", () => {
  it("the example file imports cleanly", () => {
    const result = rows(importTemplateCsv());
    expect(result.map((row) => [row.error, row.warnings])).toEqual([
      [null, []],
      [null, []],
    ]);
  });

  it("an exported demo imports back after reset without doubling anything", () => {
    const changed = setDemoApplicationNotes(
      setDemoApplicationStatus(
        importCsv(createDemoState(NOW), `${HEADER}\nAcme,Dev,Applied,2025-05-01,,Toronto,Hybrid,https://acme.example.com/1,"Line one\nline two"`).state,
        demoApplicationId("civic-form-accessibility"),
        "offer",
        LATER
      ),
      demoApplicationId("civic-form-accessibility"),
      "=Negotiate",
      LATER
    );
    const csv = exportTrackerCsv(listDemoTrackedApplications(changed, LATER));

    const reset = createDemoState(LATER);
    // Rows are sorted by company: Acme (row 2), then the two seeded jobs, which
    // are tracked again after reset, so they are duplicates; update them.
    const { state, summary } = importCsv(reset, csv, { 3: "update", 4: "update" });
    expect(summary).toMatchObject({ add: 1, update: 2, skipDuplicate: 0 });
    expect(summary.add).toBe(1);
    expect(state.applications).toHaveLength(3);

    const project = (s: DemoState) =>
      listDemoTrackedApplications(s, LATER)
        .map((app) => [app.companyName, app.title, app.status, app.notes, app.jobUrl, app.locationLabel])
        .sort();
    expect(project(state)).toEqual(project(changed));
  });
});

describe("the sandbox fixture (src/test/fixtures/tracker-import/job-tracker.csv)", () => {
  // Read as bytes, the way the browser reads an uploaded file.
  const bytes = readFileSync(resolve(process.cwd(), "src/test/fixtures/tracker-import/job-tracker.csv"));
  const table = readImportTable(decodeCsvBytes(bytes));
  const mapping = guessColumnMapping(table.headers);
  const fixtureRows = normalizeImportRows(table, mapping, "mdy");

  it("maps every column it should from the headers, and leaves the rest", () => {
    expect(missingRequiredFields(mapping)).toEqual([]);
    expect(IMPORT_FIELDS.every((field) => mapping[field] !== null)).toBe(true);
    const unused = table.headers.filter((_, column) => !Object.values(mapping).includes(column));
    expect(unused).toEqual(["Salary Range", "Recruiter"]);
    expect(detectDateFormat(table.rows, [mapping.dateApplied, mapping.followUpDate])).toEqual({
      format: "mdy",
      ambiguous: false,
    });
  });

  it("previews 16 rows: 2 skipped, 2 with notes, row numbers matching the spreadsheet", () => {
    expect(fixtureRows).toHaveLength(16);
    // Row 11 is empty in the spreadsheet, so there is no row 11 here.
    expect(fixtureRows.map((row) => row.rowNumber)).not.toContain(11);
    expect(fixtureRows.filter((row) => row.error).map((row) => [row.rowNumber, row.error])).toEqual([
      [16, "Missing role"],
      [17, "Missing company"],
    ]);
    expect(fixtureRows.filter((row) => row.warnings.length > 0).map((row) => [row.rowNumber, row.warnings.length])).toEqual([
      [9, 1],
      [10, 3],
    ]);
    const byRow = new Map(fixtureRows.map((row) => [row.rowNumber, row.values]));
    expect(byRow.get(4)).toMatchObject({ status: "recruiter_screen", dateApplied: "2025-04-09" });
    expect(byRow.get(5)).toMatchObject({
      jobUrl: "https://careers.copperline.example.com/jobs/ui-engineer",
      notes: "Offer: 118k + equity\nDecision due Friday",
    });
    expect(byRow.get(6)?.notes).toBe("- Rejected after the final round");
    expect(byRow.get(18)).toMatchObject({ company: "Café Collective", notes: "Zoë says the team is “great”" });
  });

  it("finds two tracked duplicates and one repeated posting, and imports 11 by default", () => {
    const state = createDemoState(NOW);
    const duplicates = findDemoImportDuplicates(state, fixtureRows);
    expect(
      [...duplicates].map(([row, match]) => [row, match.kind === "existing" ? match.application.companyName : match.rowNumber])
    ).toEqual([
      [12, "Harbourline Logistics"],
      [13, "Civic Form Co."],
      // Same link as row 3 with a tracking parameter, under a different title.
      [14, 3],
    ]);

    const { state: imported, summary } = importIntoDemo(state, fixtureRows, {}, LATER);
    expect(summary).toEqual({ add: 11, update: 0, unchanged: 0, skipInvalid: 2, skipDuplicate: 3 });
    // Northwind Labs is a sample job, so the row becomes that job's application.
    expect(imported.applications.find((app) => app.jobId === "northwind-senior-frontend")?.status).toBe("applied");
    // Two Birchwood openings with different links are two applications.
    expect(tracked(imported, "Birchwood Health")).toHaveLength(2);
  });

  it("updates the seeded applications when asked", () => {
    const state = createDemoState(NOW);
    const harbourline = demoApplicationId("harbourline-fullstack");
    const civic = demoApplicationId("civic-form-accessibility");
    const harbourlineRow = fixtureRows.find((row) => row.rowNumber === 12)!;
    expect(previewDemoUpdate(state, harbourline, harbourlineRow.values!, LATER).map((change) => change.label)).toEqual([
      "Status",
      "Follow-up",
      "Notes",
    ]);
    const { state: updated, summary } = importIntoDemo(state, fixtureRows, { 12: "update", 13: "update" }, LATER);
    expect(summary).toMatchObject({ add: 11, update: 2, skipDuplicate: 1 });
    expect(updated.applications.find((app) => app.id === harbourline)?.status).toBe("interviewing");
    expect(updated.applications.find((app) => app.id === civic)?.status).toBe("offer");
  });
});
