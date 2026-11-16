"use client";

/**
 * The import dialog: choose a file, map columns, preview (and fix) rows,
 * resolve duplicates, confirm. Shared by the demo tracker and the signed-in
 * tracker; each passes an ImportTarget that says where the import goes.
 * Loaded only when a visitor opens Import CSV.
 */
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, Download, FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { decodeCsvBytes } from "@/modules/applications/csv";
import { formatDisplayDate, statusLabel } from "@/modules/applications/tracker";
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_HINTS,
  IMPORT_FIELD_LABELS,
  ImportFileError,
  REQUIRED_IMPORT_FIELDS,
  checkImportFile,
  detectDateFormat,
  emptyColumnMapping,
  findImportDuplicates,
  guessColumnMapping,
  importTemplateCsv,
  missingRequiredFields,
  normalizeImportRows,
  planImport,
  readImportTable,
  resolutionFor,
  resolutionOptions,
  rawImportValue,
  summarizePlan,
  withImportEdit,
  withoutImportEdits,
  type ColumnMapping,
  type DuplicateResolution,
  type ImportDateFormat,
  type ImportDuplicate,
  type ImportEdits,
  type ImportField,
  type ImportRowResult,
  type ImportSummary,
  type ImportTable,
} from "@/modules/applications/tracker-csv";
import {
  buildImportRequest,
  planTrackedUpdate,
  type ImportCandidate,
} from "@/modules/applications/tracker-import";
import { IconLabel, downloadCsv, plural, useExportTracker } from "./csv-actions";
import { ROW_EDITOR_ATTRIBUTE, RowEditor } from "./import-row-editor";
import type { ImportOutcome, ImportTarget } from "./types";

const fieldClass =
  "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const IMPORT_DIALOG_TITLE = "Import applications from a spreadsheet";

const NO_CANDIDATES: ImportCandidate[] = [];

export function ImportDialog({ target, onClose }: { target: ImportTarget; onClose: () => void }) {
  // While an import is being saved the dialog stays open, so its result is never lost.
  const [saving, setSaving] = useState(false);
  return (
    <Dialog.Root open onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          // Phones: a full-screen sheet, so every step gets the whole screen. Larger screens: one
          // fixed, roomy size for every step, so the dialog does not jump around between steps.
          className="fixed inset-0 z-50 flex flex-col bg-card text-card-foreground focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(calc(100dvh-3rem),60rem)] sm:w-[calc(100%-3rem)] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-border sm:shadow-lg"
          // A stray click outside should not throw away a mapping in progress. Escape and Close still work.
          onInteractOutside={(event) => event.preventDefault()}
          // The opener puts focus back on its button.
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            // Escape in a row editor closes the editor, not the whole import.
            const inEditor =
              event.target instanceof Element && event.target.closest(`[${ROW_EDITOR_ATTRIBUTE}]`);
            if (inEditor || saving) event.preventDefault();
          }}
        >
          <ImportWizard target={target} onClose={onClose} saving={saving} onSavingChange={setSaving} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Step = "file" | "map" | "preview" | "duplicates" | "confirm" | "done";

const STEPS: Array<{ id: Exclude<Step, "done">; label: string }> = [
  { id: "file", label: "Choose file" },
  { id: "map", label: "Map columns" },
  { id: "preview", label: "Preview" },
  { id: "duplicates", label: "Duplicates" },
  { id: "confirm", label: "Confirm" },
];

type Loaded = { fileName: string; table: ImportTable };

type Done = {
  outcome: Exclude<ImportOutcome, { status: "error" }>;
  /** For "already imported": whether this attempt differed from the one that was saved. */
  changedSinceSaved: boolean;
  /** Rows skipped for a missing company or role. They never leave the dialog. */
  skipInvalid: number;
  /** Counted before importing; afterwards every imported row matches itself. */
  duplicatesFound: number;
};

function newImportId(): string {
  return crypto.randomUUID();
}

function ImportWizard({
  target,
  onClose,
  saving,
  onSavingChange,
}: {
  target: ImportTarget;
  onClose: () => void;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
}) {
  const { toast } = useToast();
  const exportTracker = useExportTracker();
  const [step, setStep] = useState<Step>("file");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyColumnMapping);
  const [dateFormatChoice, setDateFormatChoice] = useState<ImportDateFormat | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, DuplicateResolution>>({});
  const [edits, setEdits] = useState<ImportEdits>({});
  const [done, setDone] = useState<Done | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // One id per file: a retry after a lost connection reuses it, so the import is never saved twice.
  const [importId, setImportId] = useState(newImportId);
  // What the first attempt with this id sent, to tell whether a later retry asked for more.
  const firstAttempt = useRef<string | null>(null);

  const existing = target.existing;
  const candidates = existing.status === "ready" ? existing.candidates : NO_CANDIDATES;

  const detectedDates = useMemo(
    () =>
      loaded
        ? detectDateFormat(loaded.table.rows, [mapping.dateApplied, mapping.followUpDate])
        : { format: "mdy" as const, ambiguous: false },
    [loaded, mapping.dateApplied, mapping.followUpDate]
  );
  const dateFormat = dateFormatChoice ?? detectedDates.format;
  // Edits from the preview replace file values and go through the same checks.
  const rows = useMemo(
    () => (loaded ? normalizeImportRows(loaded.table, mapping, dateFormat, edits) : []),
    [loaded, mapping, dateFormat, edits]
  );
  // Matched against the tracker as the target reports it (live, for the demo).
  const duplicates = useMemo(() => findImportDuplicates(rows, candidates), [rows, candidates]);
  const summary = useMemo(
    () => summarizePlan(planImport(rows, duplicates, resolutions)),
    [rows, duplicates, resolutions]
  );

  // Each step starts at the top, with focus on its heading so keyboard and screen
  // reader users land on it.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function onLoaded(next: Loaded) {
    setLoaded(next);
    setMapping(guessColumnMapping(next.table.headers));
    setDateFormatChoice(null);
    setResolutions({});
    setEdits({});
    setImportError(null);
    setImportId(newImportId());
    firstAttempt.current = null;
    setStep("map");
  }

  async function runImport() {
    if (saving || !loaded) return;
    setImportError(null);
    onSavingChange(true);
    const duplicatesFound = duplicates.size;
    const skipInvalid = rows.filter((row) => !row.values).length;
    const request = buildImportRequest(importId, loaded.fileName, rows, resolutions);
    const sent = JSON.stringify({ rows: request.rows, resolutions: request.resolutions });
    firstAttempt.current ??= sent;
    const changedSinceSaved = firstAttempt.current !== sent;
    let outcome: ImportOutcome;
    try {
      outcome = await target.save(request);
    } catch {
      // The request may or may not have reached the server; the same id makes a retry safe.
      outcome = {
        status: "error",
        message:
          "We could not confirm the import. Check your connection and try again; it will not be imported twice.",
      };
    } finally {
      onSavingChange(false);
    }
    if (outcome.status === "error") {
      setImportError(outcome.message);
      return;
    }
    setDone({ outcome, skipInvalid, duplicatesFound, changedSinceSaved });
    setStep("done");
  }

  function undoImport() {
    if (done?.outcome.status !== "imported" || !done.outcome.undo) return;
    done.outcome.undo();
    onClose();
    toast({ title: "Import undone", description: "Your tracker is back to how it was before the import." });
  }

  async function exportAfterImport() {
    setExporting(true);
    try {
      exportTracker(await target.exportApplications());
    } catch {
      toast({
        title: "Could not export",
        description: "Your tracker could not be loaded. Try Export CSV on the tracker page.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  const heading = (text: string) => (
    <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-none">
      {text}
    </h3>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (step === "file" || !loaded) {
    body = (
      <>
        {heading("Choose a CSV file")}
        <FileStep onLoaded={onLoaded} />
      </>
    );
    footer = null;
  } else if (step === "map") {
    const missing = missingRequiredFields(mapping);
    body = (
      <>
        {heading("Match your columns")}
        <MapStep
          loaded={loaded}
          mapping={mapping}
          onMappingChange={setMapping}
          dateFormat={dateFormat}
          datesAmbiguous={detectedDates.ambiguous && dateFormatChoice === null}
          onDateFormatChange={setDateFormatChoice}
          missing={missing}
        />
      </>
    );
    footer = (
      <StepFooter
        onBack={() => setStep("file")}
        backLabel="Choose another file"
        next={{ label: "Preview", onClick: () => setStep("preview"), disabled: missing.length > 0 }}
      />
    );
  } else if (step === "preview") {
    const importable = rows.some((row) => row.values);
    body = (
      <>
        {heading("Preview your records")}
        <ExistingStatus existing={existing} />
        <PreviewStep
          loaded={loaded}
          mapping={mapping}
          rows={rows}
          duplicates={duplicates}
          edits={edits}
          dateFormat={dateFormat}
          onEdit={(rowNumber, field, value) =>
            setEdits((current) =>
              withImportEdit(
                current,
                rowNumber,
                field,
                value,
                rawImportValue(loaded.table, mapping, rowNumber, field)
              )
            )
          }
          onUndoRow={(rowNumber) => setEdits((current) => withoutImportEdits(current, rowNumber))}
        />
      </>
    );
    footer = (
      <StepFooter
        onBack={() => setStep("map")}
        next={{
          label: duplicates.size > 0 ? "Review duplicates" : "Continue",
          onClick: () => setStep(duplicates.size > 0 ? "duplicates" : "confirm"),
          // Duplicates can only be decided once the tracker has been checked.
          disabled: !importable || existing.status !== "ready",
        }}
      />
    );
  } else if (step === "duplicates") {
    body = (
      <>
        {heading("Decide what to do with duplicates")}
        <DuplicatesStep rows={rows} duplicates={duplicates} resolutions={resolutions} onChange={setResolutions} />
      </>
    );
    footer = (
      <StepFooter onBack={() => setStep("preview")} next={{ label: "Continue", onClick: () => setStep("confirm") }} />
    );
  } else if (step === "confirm") {
    const changes = summary.add + summary.update;
    body = (
      <>
        {heading("Confirm the import")}
        <ConfirmStep
          summary={summary}
          fileName={loaded.fileName}
          duplicatesFound={duplicates.size}
          editedRows={Object.keys(edits).length}
          storageNote={target.storageNote}
        />
        {importError ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {importError}
          </p>
        ) : null}
      </>
    );
    footer = (
      <StepFooter
        onBack={() => setStep(duplicates.size > 0 ? "duplicates" : "preview")}
        backDisabled={saving}
        next={{
          label: saving
            ? "Importing…"
            : changes > 0
              ? `${importError ? "Try again: import" : "Import"} ${plural(changes, "application")}`
              : "Nothing to import",
          onClick: () => void runImport(),
          disabled: changes === 0 || existing.status !== "ready",
          loading: saving,
        }}
      />
    );
  } else {
    const undo = done?.outcome.status === "imported" ? done.outcome.undo : undefined;
    body = (
      <>
        {heading(done?.outcome.status === "already_imported" ? "Already imported" : "Import complete")}
        {done ? <DoneStep done={done} /> : null}
      </>
    );
    footer = (
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between">
        <Button type="button" className="col-span-2 min-h-10 sm:order-last" onClick={onClose}>
          View tracker
        </Button>
        {undo ? (
          <Button type="button" variant="ghost" className="min-h-10 sm:order-first sm:mr-auto" onClick={undoImport}>
            Undo import
          </Button>
        ) : (
          <span className="sm:order-first sm:mr-auto" />
        )}
        <Button
          type="button"
          variant="outline"
          className="min-h-10"
          loading={exporting}
          onClick={() => void exportAfterImport()}
        >
          <IconLabel icon={Download}>Export CSV</IconLabel>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-border px-4 py-3 pr-14 sm:px-6 sm:py-4 sm:pr-14">
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="Close"
            disabled={saving}
            className="absolute right-1 top-1 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 sm:right-2 sm:top-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </Dialog.Close>
        <Dialog.Title className="text-base font-semibold leading-snug sm:text-lg">{IMPORT_DIALOG_TITLE}</Dialog.Title>
        {/* Shown on the first step; later steps keep it for screen readers and save space on phones. */}
        <Dialog.Description className={step === "file" ? "mt-1 text-sm text-muted-foreground" : "sr-only"}>
          {target.description}
        </Dialog.Description>
        <Stepper
          current={step}
          skipDuplicates={
            done ? done.duplicatesFound === 0 : step !== "file" && step !== "map" && duplicates.size === 0
          }
        />
      </div>
      {/* The only scrolling area in the dialog: no scroll boxes inside scroll boxes. The padding
          is on an inner box so sticky content (the preview's table header) sits flush at the top. */}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-4 p-4 sm:p-6">{body}</div>
      </div>
      {footer ? (
        <div className="border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-4">
          {footer}
        </div>
      ) : null}
    </>
  );
}

/** Whether the tracker has been checked for duplicates yet. */
function ExistingStatus({ existing }: { existing: ImportTarget["existing"] }) {
  if (existing.status === "ready") return null;
  if (existing.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Checking your tracker for duplicates…
      </p>
    );
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <span>{existing.message}</span>
      <Button type="button" size="sm" variant="outline" className="min-h-10 bg-background" onClick={existing.retry}>
        Try again
      </Button>
    </div>
  );
}

function Stepper({ current, skipDuplicates }: { current: Step; skipDuplicates: boolean }) {
  const currentIndex = current === "done" ? STEPS.length : STEPS.findIndex((step) => step.id === current);
  return (
    <ol aria-label="Import steps" className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs sm:mt-3">
      {STEPS.map((step, index) => {
        const skipped = step.id === "duplicates" && skipDuplicates;
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.id}
            aria-current={active ? "step" : undefined}
            className={cn(
              // Phones show only the current step.
              "items-center gap-1.5",
              active ? "flex font-semibold text-foreground" : "hidden text-muted-foreground sm:flex"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[0.7rem]",
                active && "border-primary bg-primary text-primary-foreground",
                complete && !active && "border-green-700 text-green-700"
              )}
            >
              {complete ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            {step.label}
            {active ? (
              <span className="font-normal text-muted-foreground sm:hidden">
                (step {index + 1} of {STEPS.length})
              </span>
            ) : null}
            {skipped ? <span className="font-normal">(none found)</span> : null}
            {complete ? <span className="sr-only">(done)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepFooter({
  onBack,
  backLabel = "Back",
  backDisabled = false,
  next,
}: {
  onBack: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  next: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean };
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="ghost" className="min-h-10 px-3" onClick={onBack} disabled={backDisabled}>
        {backLabel}
      </Button>
      <Button
        type="button"
        className="min-h-10"
        onClick={next.onClick}
        disabled={next.disabled}
        loading={next.loading}
      >
        {next.label}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: choose a file
// ---------------------------------------------------------------------------

function FileStep({ onLoaded }: { onLoaded: (loaded: Loaded) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      checkImportFile(file);
      const table = readImportTable(decodeCsvBytes(await file.arrayBuffer()));
      onLoaded({ fileName: file.name, table });
    } catch (caught) {
      setError(
        caught instanceof ImportFileError
          ? caught.message
          : "That file could not be read. Save it as CSV from your spreadsheet app and try again."
      );
    } finally {
      setReading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void read(event.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Export your tracker from Google Sheets, Excel, Numbers, or Notion as a CSV file. Any column
        names work: you will match them up next. Company and role are the only required columns.
      </p>
      <div>
        <input
          id="import-file"
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className="peer sr-only"
          disabled={reading}
          onChange={(event) => {
            void read(event.target.files?.[0]);
            // Allow choosing the same file again after fixing it.
            event.target.value = "";
          }}
        />
        <label
          htmlFor="import-file"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            // A big drop target on larger screens, where the dialog has the room.
            "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring sm:min-h-72",
            dragging && "border-primary bg-accent"
          )}
        >
          <FileUp className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">{reading ? "Reading…" : "Choose a CSV file"}</span>
          <span className="text-xs text-muted-foreground">or drop it here · up to 1 MB and 500 rows</span>
        </label>
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Not sure about the format?{" "}
        <button
          type="button"
          className="inline-flex min-h-10 items-center text-blue-600 underline-offset-2 hover:underline"
          onClick={() => downloadCsv(importTemplateCsv(), "job-applications-example.csv")}
        >
          Download an example file
        </button>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: map columns
// ---------------------------------------------------------------------------

function sampleValue(table: ImportTable, column: number | null): string | null {
  if (column === null) return null;
  const value = table.rows.map((row) => (row[column] ?? "").trim()).find(Boolean);
  if (!value) return null;
  const line = value.replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

function MapStep({
  loaded,
  mapping,
  onMappingChange,
  dateFormat,
  datesAmbiguous,
  onDateFormatChange,
  missing,
}: {
  loaded: Loaded;
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  dateFormat: ImportDateFormat;
  datesAmbiguous: boolean;
  onDateFormatChange: (format: ImportDateFormat) => void;
  missing: ImportField[];
}) {
  const { table, fileName } = loaded;
  const fieldForColumn = new Map<number, ImportField>();
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field];
    if (column !== null) fieldForColumn.set(column, field);
  }
  const unused = table.headers.filter((_, column) => !fieldForColumn.has(column));
  const hasDates = mapping.dateApplied !== null || mapping.followUpDate !== null;

  function assign(field: ImportField, value: string) {
    const column = value === "" ? null : Number(value);
    const next = { ...mapping, [field]: column };
    // A column feeds one field: choosing it here takes it away from the other.
    for (const other of IMPORT_FIELDS) {
      if (other !== field && column !== null && next[other] === column) next[other] = null;
    }
    onMappingChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{fileName}</span> has{" "}
        {plural(table.rows.length, "row")} and {plural(table.headers.length, "column")}. We matched
        what we could; check each field and change anything that looks wrong.
      </p>

      {/* Two columns on wide screens, so all nine fields fit without scrolling. */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {IMPORT_FIELDS.map((field) => {
          const id = `import-map-${field}`;
          const required = REQUIRED_IMPORT_FIELDS.includes(field);
          const sample = sampleValue(table, mapping[field]);
          return (
            <div
              key={field}
              // grid-cols-1 is minmax(0, 1fr): long column names must not widen the dialog on phones.
              className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center"
            >
              <div>
                <Label htmlFor={id}>
                  {IMPORT_FIELD_LABELS[field]}
                  {required ? <span className="text-red-700"> *</span> : null}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">{IMPORT_FIELD_HINTS[field]}</p>
              </div>
              <div className="min-w-0">
                <select
                  id={id}
                  className={fieldClass}
                  value={mapping[field] ?? ""}
                  aria-required={required || undefined}
                  aria-invalid={(required && mapping[field] === null) || undefined}
                  aria-describedby={`${id}-sample`}
                  onChange={(event) => assign(field, event.target.value)}
                >
                  <option value="">{required ? "Choose a column" : "Don't import"}</option>
                  {table.headers.map((header, column) => {
                    const owner = fieldForColumn.get(column);
                    return (
                      <option key={column} value={column}>
                        {header}
                        {owner && owner !== field ? ` (now ${IMPORT_FIELD_LABELS[owner]})` : ""}
                      </option>
                    );
                  })}
                </select>
                <p id={`${id}-sample`} className="mt-1 truncate text-xs text-muted-foreground">
                  {mapping[field] === null ? "Not imported" : sample ? `e.g. ${sample}` : "This column is empty"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {hasDates ? (
        <div className="space-y-1">
          <Label htmlFor="import-map-date-format">Dates written with numbers, like 03/04/2025, are</Label>
          <select
            id="import-map-date-format"
            className={cn(fieldClass, "sm:max-w-sm")}
            value={dateFormat}
            aria-describedby="import-map-date-format-hint"
            onChange={(event) => onDateFormatChange(event.target.value as ImportDateFormat)}
          >
            <option value="mdy">Month first (MM/DD/YYYY)</option>
            <option value="dmy">Day first (DD/MM/YYYY)</option>
          </select>
          <p
            id="import-map-date-format-hint"
            className={cn("text-xs", datesAmbiguous ? "text-amber-800" : "text-muted-foreground")}
          >
            {datesAmbiguous
              ? "Your file's dates could be read either way. Check one you know and pick the matching order."
              : "Dates like 2025-03-14 or Mar 14, 2025 are read the same either way."}
          </p>
        </div>
      ) : null}

      {unused.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Not imported:</span> {unused.join(", ")}
        </p>
      ) : null}

      {missing.length > 0 ? (
        <p className="text-sm text-red-800">
          Choose a column for {missing.map((field) => IMPORT_FIELD_LABELS[field]).join(" and ")} to
          continue.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: preview
// ---------------------------------------------------------------------------

/** Opening a row's editor, optionally at the field that was clicked. */
type OpenEditor = (rowNumber: number, field?: ImportField) => void;

function PreviewStep({
  loaded,
  mapping,
  rows,
  duplicates,
  edits,
  dateFormat,
  onEdit,
  onUndoRow,
}: {
  loaded: Loaded;
  mapping: ColumnMapping;
  rows: ImportRowResult[];
  duplicates: Map<number, ImportDuplicate>;
  edits: ImportEdits;
  dateFormat: ImportDateFormat;
  onEdit: (rowNumber: number, field: ImportField, value: string) => void;
  onUndoRow: (rowNumber: number) => void;
}) {
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [editing, setEditing] = useState<{ rowNumber: number; field: ImportField | null } | null>(null);
  const wide = useWideLayout();
  const invalid = rows.filter((row) => !row.values).length;
  const warned = rows.filter((row) => row.values && row.warnings.length > 0).length;
  const ready = rows.length - invalid - warned;
  const editedRows = Object.keys(edits).length;
  const hasIssues = (row: ImportRowResult) => !row.values || row.warnings.length > 0;
  const issueCount = rows.filter(hasIssues).length;
  // A row fixed under the filter stays in view, so it does not vanish mid-edit.
  const shown = issuesOnly
    ? rows.filter((row) => hasIssues(row) || row.rowNumber in edits || row.rowNumber === editing?.rowNumber)
    : rows;

  const fileValue = (rowNumber: number, field: ImportField) =>
    rawImportValue(loaded.table, mapping, rowNumber, field);

  const open: OpenEditor = (rowNumber, field) => setEditing({ rowNumber, field: field ?? null });
  const close = () => {
    const rowNumber = editing?.rowNumber;
    setEditing(null);
    // Back to the button that opened the editor.
    if (rowNumber !== undefined) {
      requestAnimationFrame(() => document.getElementById(editButtonId(rowNumber))?.focus());
    }
  };

  const editorFor = (row: ImportRowResult) =>
    editing?.rowNumber === row.rowNumber ? (
      <RowEditor
        // A new key per clicked field, so clicking another cell of the open row moves focus there.
        key={`${row.rowNumber}:${editing.field ?? ""}`}
        row={row}
        fileValue={(field) => fileValue(row.rowNumber, field)}
        edits={edits[row.rowNumber]}
        dateFormat={dateFormat}
        duplicate={duplicates.get(row.rowNumber)}
        focusField={editing.field}
        onChange={(field, value) => onEdit(row.rowNumber, field, value)}
        onUndo={() => onUndoRow(row.rowNumber)}
        onDone={close}
      />
    ) : null;

  const props: PreviewRowsProps = {
    rows: shown,
    duplicates,
    edits,
    fileValue,
    fileName: loaded.fileName,
    editingRow: editing?.rowNumber ?? null,
    open,
    editorFor,
  };

  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-2 text-sm" aria-label="Preview summary">
        <li className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-900">
          {ready} ready
        </li>
        {warned > 0 ? (
          <li className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-950">
            {warned} with notes
          </li>
        ) : null}
        {invalid > 0 ? (
          <li className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-900">
            {invalid} will be skipped
          </li>
        ) : null}
        {duplicates.size > 0 ? (
          <li className="rounded-full border border-border bg-muted px-3 py-1">
            {plural(duplicates.size, "possible duplicate")}
          </li>
        ) : null}
        {editedRows > 0 ? (
          <li className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-900">
            {plural(editedRows, "row")} edited
          </li>
        ) : null}
      </ul>

      {rows.every((row) => !row.values) ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          None of these rows has both a company and a role. Go back and check which columns hold them,
          or fix rows below.
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {issueCount > 0
          ? "Click a row to fix it here before importing. Your file is not changed."
          : "Click a row to change anything before importing. Your file is not changed."}
      </p>

      {issueCount > 0 || issuesOnly ? (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={issuesOnly}
            onChange={(event) => setIssuesOnly(event.target.checked)}
          />
          Only show rows with notes or problems ({issueCount})
        </label>
      ) : null}

      {wide ? <PreviewTable {...props} /> : <PreviewCards {...props} />}
    </div>
  );
}

type PreviewRowsProps = {
  rows: ImportRowResult[];
  duplicates: Map<number, ImportDuplicate>;
  edits: ImportEdits;
  fileValue: (rowNumber: number, field: ImportField) => string;
  fileName: string;
  editingRow: number | null;
  open: OpenEditor;
  editorFor: (row: ImportRowResult) => React.ReactNode;
};

function editButtonId(rowNumber: number): string {
  return `import-edit-row-${rowNumber}`;
}

function rowTone(row: ImportRowResult): string | false {
  if (!row.values) return "bg-red-50";
  return row.warnings.length > 0 && "bg-amber-50";
}

/** Why a row is skipped, what was changed on the way in, and whether it is a duplicate. */
function RowIssues({ row, duplicate }: { row: ImportRowResult; duplicate: ImportDuplicate | undefined }) {
  if (row.values && row.warnings.length === 0 && !duplicate) return null;
  return (
    <div className="space-y-1 text-xs">
      {!row.values ? <p className="font-medium text-red-900">Skipped: {row.error}</p> : null}
      {row.warnings.length > 0 ? (
        <ul className="space-y-1 text-amber-950">
          {row.warnings.map((issue) => (
            <li key={issue.message}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      {duplicate ? (
        <p className="text-muted-foreground">
          {duplicate.kind === "existing" ? "Already in your tracker" : `Repeats row ${duplicate.rowNumber}`}
        </p>
      ) : null}
    </div>
  );
}

/** "Fix" for rows that need attention, "Edit" for the rest. One tab stop per row. */
function EditRowButton({
  row,
  expanded,
  open,
}: {
  row: ImportRowResult;
  expanded: boolean;
  open: OpenEditor;
}) {
  const fix = !row.values || row.warnings.length > 0;
  return (
    <Button
      id={editButtonId(row.rowNumber)}
      type="button"
      size="sm"
      variant={fix ? "outline" : "ghost"}
      className={cn("h-8 px-2 text-xs", fix && "border-amber-400 bg-background")}
      aria-expanded={expanded}
      aria-label={`${fix ? "Fix" : "Edit"} row ${row.rowNumber}`}
      onClick={(event) => {
        // The row itself also opens the editor on click; do not count this click twice.
        event.stopPropagation();
        open(row.rowNumber);
      }}
    >
      {fix ? "Fix" : "Edit"}
    </Button>
  );
}

function EditedMark({ edited }: { edited: boolean }) {
  return edited ? <span className="ml-1 align-super text-[0.65rem] font-medium text-blue-700">edited</span> : null;
}

/**
 * Wide screens. No scroll box of its own: the dialog body scrolls, and the
 * header row sticks to the top of it so the columns stay labelled. Clicking a
 * cell opens the row's editor at that field.
 */
function PreviewTable({ rows, duplicates, edits, fileValue, fileName, editingRow, open, editorFor }: PreviewRowsProps) {
  // Sticky cells lose collapsed borders, so the header's rule is a shadow.
  const th =
    "sticky top-0 z-10 bg-muted p-2 text-left font-medium shadow-[inset_0_-1px_0_var(--color-border)] first:rounded-tl-lg last:rounded-tr-lg";
  return (
    // No overflow on the wrapper: that would make it a scroll box and unstick the header.
    <div className="rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Rows from {fileName}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>Row</th>
            <th scope="col" className={th}>Company</th>
            <th scope="col" className={th}>Role</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Applied</th>
            <th scope="col" className={th}>Follow-up</th>
            <th scope="col" className={th}>Location</th>
            <th scope="col" className={cn(th, "w-[28%]")}>Notes from import</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = row.values;
            const duplicate = duplicates.get(row.rowNumber);
            const rowEdits = edits[row.rowNumber];
            const expanded = editingRow === row.rowNumber;
            // Mouse shortcut to the editor; the row's button is the keyboard route.
            const cellProps = (field: ImportField) => ({
              onClick: () => open(row.rowNumber, field),
              className: "cursor-pointer p-2",
            });
            const text = (field: ImportField, shown: string | null | undefined) => (
              <>
                {shown || fileValue(row.rowNumber, field) || "—"}
                <EditedMark edited={rowEdits?.[field] !== undefined} />
              </>
            );
            return (
              <Fragment key={row.rowNumber}>
                <tr
                  className={cn(
                    "border-b border-border align-top last:border-0 hover:bg-accent/60",
                    rowTone(row),
                    expanded && "bg-accent/60"
                  )}
                >
                  <td className="p-2">
                    <div className="flex items-center gap-2 tabular-nums">
                      {row.rowNumber}
                      <EditRowButton row={row} expanded={expanded} open={open} />
                    </div>
                  </td>
                  <td {...cellProps("company")}>{text("company", values?.company)}</td>
                  <td {...cellProps("title")}>{text("title", values?.title)}</td>
                  <td {...cellProps("status")}>
                    {values ? statusLabel(values.status) : "—"}
                    <EditedMark edited={rowEdits?.status !== undefined} />
                  </td>
                  <td {...cellProps("dateApplied")} className="cursor-pointer whitespace-nowrap p-2">
                    {formatDisplayDate(values?.dateApplied)}
                    <EditedMark edited={rowEdits?.dateApplied !== undefined} />
                  </td>
                  <td {...cellProps("followUpDate")} className="cursor-pointer whitespace-nowrap p-2">
                    {formatDisplayDate(values?.followUpDate)}
                    <EditedMark edited={rowEdits?.followUpDate !== undefined} />
                  </td>
                  <td {...cellProps("location")}>{text("location", values?.location)}</td>
                  <td
                    className="cursor-pointer p-2"
                    // The notes column opens the editor at the first field with a problem.
                    onClick={() => open(row.rowNumber, row.missing[0] ?? row.warnings[0]?.field)}
                  >
                    <RowIssues row={row} duplicate={duplicate} />
                    {values && row.warnings.length === 0 && !duplicate ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : null}
                  </td>
                </tr>
                {expanded ? (
                  <tr className="border-b border-border last:border-0">
                    <td colSpan={8} className="p-0">
                      {editorFor(row)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Phones and tablets: one card per row, so nothing needs scrolling sideways. Tap a card to edit it. */
function PreviewCards({ rows, duplicates, edits, fileValue, fileName, editingRow, open, editorFor }: PreviewRowsProps) {
  return (
    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={`Rows from ${fileName}`}>
      {rows.map((row) => {
        const values = row.values;
        const duplicate = duplicates.get(row.rowNumber);
        const expanded = editingRow === row.rowNumber;
        const details = values
          ? [
              values.dateApplied ? `Applied ${formatDisplayDate(values.dateApplied)}` : null,
              values.followUpDate ? `Follow-up ${formatDisplayDate(values.followUpDate)}` : null,
              values.location,
            ].filter(Boolean)
          : [];
        return (
          <li
            key={row.rowNumber}
            // The editor needs the full width.
            className={cn("overflow-hidden rounded-lg border border-border text-sm", rowTone(row), expanded && "sm:col-span-2")}
          >
            <div
              className="cursor-pointer space-y-1 p-3"
              onClick={() => (expanded ? undefined : open(row.rowNumber))}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Row {row.rowNumber}
                  {row.rowNumber in edits ? <span className="ml-1 font-medium text-blue-700">· edited</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  {values ? <span className="font-medium text-foreground">{statusLabel(values.status)}</span> : null}
                  <EditRowButton row={row} expanded={expanded} open={open} />
                </span>
              </div>
              <p className="font-medium">{values?.title ?? (fileValue(row.rowNumber, "title") || "No role")}</p>
              <p className="text-muted-foreground">
                {values?.company ?? (fileValue(row.rowNumber, "company") || "No company")}
              </p>
              {details.length > 0 ? <p className="text-xs text-muted-foreground">{details.join(" · ")}</p> : null}
              <RowIssues row={row} duplicate={duplicate} />
            </div>
            {expanded ? editorFor(row) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Matches the `lg` breakpoint, the first width where all eight columns fit the
 * dialog. Picks one preview layout instead of rendering both.
 */
const WIDE_QUERY = "(min-width: 1024px)";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useWideLayout(): boolean {
  // The wizard only renders in the browser (it is loaded with ssr: false).
  return useSyncExternalStore(subscribeToWidth, () => window.matchMedia(WIDE_QUERY).matches, () => true);
}

// ---------------------------------------------------------------------------
// Step 4: duplicates
// ---------------------------------------------------------------------------

const RESOLUTION_LABELS: Record<DuplicateResolution, string> = {
  skip: "Skip this row",
  update: "Update the tracked application",
  keep_both: "Import it anyway, as a separate application",
};

function DuplicatesStep({
  rows,
  duplicates,
  resolutions,
  onChange,
}: {
  rows: ImportRowResult[];
  duplicates: Map<number, ImportDuplicate<ImportCandidate>>;
  resolutions: Record<number, DuplicateResolution>;
  onChange: (resolutions: Record<number, DuplicateResolution>) => void;
}) {
  const items = rows.flatMap((row) => {
    const duplicate = duplicates.get(row.rowNumber);
    return duplicate && row.values ? [{ row, values: row.values, duplicate }] : [];
  });
  const existingCount = items.filter((item) => item.duplicate.kind === "existing").length;
  const fileCount = items.length - existingCount;

  function setAll(resolution: DuplicateResolution) {
    const next = { ...resolutions };
    for (const item of items) next[item.row.rowNumber] = resolutionFor(item.duplicate, resolution);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {[
          existingCount > 0 ? `${plural(existingCount, "row")} ${existingCount === 1 ? "matches an application" : "match applications"} already in your tracker` : null,
          fileCount > 0 ? `${plural(fileCount, "row")} ${fileCount === 1 ? "repeats" : "repeat"} an earlier row of the file` : null,
        ]
          .filter(Boolean)
          .join(", and ")}
        . Rows match when they have the same job link, or the same company and role. Duplicates are
        skipped unless you choose otherwise.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Set all to:</span>
        <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setAll("skip")}>
          Skip
        </Button>
        {existingCount > 0 ? (
          <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setAll("update")}>
            Update
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setAll("keep_both")}>
          Import anyway
        </Button>
      </div>

      <ul className="space-y-3">
        {items.map(({ row, values, duplicate }) => {
          const chosen = resolutionFor(duplicate, resolutions[row.rowNumber]);
          const changes =
            duplicate.kind === "existing" && chosen === "update"
              ? planTrackedUpdate(duplicate.application, values).changes
              : null;
          return (
            <li key={row.rowNumber} className="rounded-lg border border-border p-3">
              <fieldset>
                <legend className="text-sm font-medium">
                  Row {row.rowNumber}: {values.title} at {values.company}
                </legend>
                <p className="mt-1 text-sm text-muted-foreground">
                  {duplicate.kind === "existing"
                    ? `Matches ${duplicate.application.title} at ${duplicate.application.companyName}, tracked as ${statusLabel(duplicate.application.status)}.`
                    : `Repeats row ${duplicate.rowNumber} of this file.`}
                </p>
                <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">
                  {resolutionOptions(duplicate).map((option) => (
                    <label key={option} className="flex min-h-10 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        className="h-4 w-4"
                        name={`import-duplicate-${row.rowNumber}`}
                        value={option}
                        checked={chosen === option}
                        onChange={() => onChange({ ...resolutions, [row.rowNumber]: option })}
                      />
                      {RESOLUTION_LABELS[option]}
                    </label>
                  ))}
                </div>
                {changes ? (
                  changes.length > 0 ? (
                    <dl className="mt-2 grid gap-x-3 gap-y-1 rounded-md bg-muted/50 p-2 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
                      {changes.map((change) => (
                        <div key={change.label} className="contents">
                          <dt className="font-medium">{change.label}</dt>
                          <dd className="break-words">
                            <span className="text-muted-foreground line-through">{change.before}</span>{" "}
                            <span aria-hidden="true">→</span>
                            <span className="sr-only">changes to</span> {change.after}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      The tracked application already has these values, so nothing would change.
                    </p>
                  )
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: confirm, and the result
// ---------------------------------------------------------------------------

function ConfirmStep({
  summary,
  fileName,
  duplicatesFound,
  editedRows,
  storageNote,
}: {
  summary: ImportSummary;
  fileName: string;
  duplicatesFound: number;
  editedRows: number;
  storageNote: React.ReactNode;
}) {
  const lines = [
    { count: summary.add, text: `${plural(summary.add, "new application")} will be added` },
    { count: summary.update, text: `${plural(summary.update, "tracked application")} will be updated` },
    { count: summary.skipDuplicate, text: `${plural(summary.skipDuplicate, "duplicate")} will be skipped` },
    {
      count: summary.skipInvalid,
      text: `${plural(summary.skipInvalid, "row")} without a company or role will be skipped`,
    },
  ].filter((line) => line.count > 0);
  if (duplicatesFound === 0) lines.push({ count: 0, text: "No duplicates found" });
  if (editedRows > 0) {
    lines.push({ count: editedRows, text: `${plural(editedRows, "row")} edited in the preview` });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        From <span className="font-medium text-foreground">{fileName}</span>:
      </p>
      <ul className="space-y-2 text-sm">
        {lines.map((line) => (
          <li key={line.text} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
            {line.text}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{storageNote}</p>
    </div>
  );
}

function DoneStep({ done }: { done: Done }) {
  const { outcome } = done;
  if (outcome.status === "already_imported") {
    return (
      <div className="space-y-4" role="status">
        <p className="flex gap-2 text-sm">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
          <span>
            This import was already saved, so nothing was imported twice.
            {done.changedSinceSaved
              ? " Changes you made after that first attempt were not applied; import the file again to apply them (rows already in your tracker will show up as duplicates)."
              : " Your tracker has everything from it."}
          </span>
        </p>
      </div>
    );
  }
  const { summary } = outcome;
  const parts = [
    summary.add > 0 ? `added ${plural(summary.add, "application")}` : null,
    summary.update > 0 ? `updated ${summary.update}` : null,
  ].filter(Boolean);
  const skipped = [
    summary.skipDuplicate > 0 ? plural(summary.skipDuplicate, "duplicate") : null,
    done.skipInvalid > 0 ? `${plural(done.skipInvalid, "row")} without a company or role` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-4" role="status">
      <p className="flex gap-2 text-sm">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
        <span>
          {parts.length > 0 ? `Done: ${parts.join(" and ")}.` : "Nothing changed."}
          {summary.unchanged > 0
            ? ` ${plural(summary.unchanged, "match", "matches")} already had the same values.`
            : ""}
          {skipped.length > 0 ? ` Skipped ${skipped.join(" and ")}.` : ""}
        </span>
      </p>
      {outcome.warning ? (
        <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {outcome.warning}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Edit statuses, follow-ups, and notes right in the tracker. Export a CSV any time to take your
        data back to a spreadsheet.
      </p>
    </div>
  );
}
