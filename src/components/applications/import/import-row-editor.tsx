"use client";

/**
 * Editing one row of the import preview. Every change is applied as it is
 * made: the wizard re-checks the row with the same rules as the file, so the
 * messages here, the preview, and the duplicate matching all update live.
 */
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { statusLabel, statusOptions } from "@/modules/applications/tracker";
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  REQUIRED_IMPORT_FIELDS,
  parseImportDate,
  parseImportStatus,
  parseImportWorkplace,
  type ImportDateFormat,
  type ImportDuplicate,
  type ImportField,
  type ImportRowResult,
} from "@/modules/applications/tracker-csv";

const fieldClass =
  "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-amber-500";

/** Select value standing for "what the file says", when the file's value is not one we recognize. */
const FILE_VALUE = "__file__";

const WORKPLACE_OPTIONS = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["on_site", "On-site"],
] as const;

export function rowEditorFieldId(rowNumber: number, field: ImportField): string {
  return `import-edit-${rowNumber}-${field}`;
}

/** Marks the editor so the dialog leaves Escape to it. */
export const ROW_EDITOR_ATTRIBUTE = "data-import-row-editor";

export function RowEditor({
  row,
  fileValue,
  edits,
  dateFormat,
  duplicate,
  focusField,
  onChange,
  onUndo,
  onDone,
}: {
  row: ImportRowResult;
  /** What the file says for a field, before edits. */
  fileValue: (field: ImportField) => string;
  edits: Readonly<Partial<Record<ImportField, string>>> | undefined;
  dateFormat: ImportDateFormat;
  duplicate: ImportDuplicate | undefined;
  /** The field to put focus in when the editor opens. */
  focusField: ImportField | null;
  onChange: (field: ImportField, value: string) => void;
  onUndo: () => void;
  onDone: () => void;
}) {
  const { rowNumber } = row;
  const edited = edits ? Object.keys(edits).length : 0;

  // Focus the field that was clicked, else the first one that needs attention.
  useEffect(() => {
    const target =
      focusField ?? row.missing[0] ?? row.warnings[0]?.field ?? ("company" satisfies ImportField);
    document.getElementById(rowEditorFieldId(rowNumber, target))?.focus();
    // Only when the editor opens; later changes must not move focus while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valueOf = (field: ImportField) => edits?.[field] ?? fileValue(field);
  const issuesFor = (field: ImportField) => {
    const messages = row.warnings.filter((issue) => issue.field === field).map((issue) => issue.message);
    if (row.missing.includes(field)) {
      messages.unshift(`Required. Without a ${field === "company" ? "company" : "role"} this row is skipped.`);
    }
    return messages;
  };

  function control(field: ImportField, describedBy: string | undefined, invalid: boolean) {
    const common = {
      id: rowEditorFieldId(rowNumber, field),
      "aria-describedby": describedBy,
      "aria-invalid": invalid || undefined,
      "aria-required": REQUIRED_IMPORT_FIELDS.includes(field) || undefined,
    };

    if (field === "status" || field === "workplaceType") {
      const fromFile = fileValue(field);
      const recognized =
        field === "status" ? parseImportStatus(fromFile) : parseImportWorkplace(fromFile);
      const edit = edits?.[field];
      // The file's value is offered as it was written when it is not one we recognize.
      const value = edit ?? (recognized ?? (fromFile ? FILE_VALUE : ""));
      const options: ReadonlyArray<readonly [string, string]> =
        field === "status"
          ? statusOptions(row.values?.status ?? parseImportStatus(value) ?? "saved").map(
              (status) => [status, statusLabel(status)] as const
            )
          : WORKPLACE_OPTIONS;
      return (
        <select
          {...common}
          className={fieldClass}
          value={value}
          onChange={(event) =>
            onChange(field, event.target.value === FILE_VALUE ? fromFile : event.target.value)
          }
        >
          {fromFile && !recognized ? (
            <option value={FILE_VALUE}>“{fromFile}” (not recognized)</option>
          ) : null}
          <option value="">Not set</option>
          {options.map(([optionValue, label]) => (
            <option key={optionValue} value={optionValue}>
              {label}
            </option>
          ))}
        </select>
      );
    }

    if (field === "dateApplied" || field === "followUpDate") {
      // A date picker needs YYYY-MM-DD; an unreadable date shows empty, with its message below.
      const value = edits?.[field] ?? parseImportDate(fileValue(field), dateFormat) ?? "";
      return (
        <input
          {...common}
          type="date"
          className={fieldClass}
          value={value}
          onChange={(event) => onChange(field, event.target.value)}
        />
      );
    }

    if (field === "notes") {
      return (
        <Textarea
          {...common}
          rows={3}
          value={valueOf(field)}
          onChange={(event) => onChange(field, event.target.value)}
        />
      );
    }

    return (
      <input
        {...common}
        type={field === "jobUrl" ? "url" : "text"}
        inputMode={field === "jobUrl" ? "url" : undefined}
        className={fieldClass}
        value={valueOf(field)}
        onChange={(event) => onChange(field, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onDone();
          }
        }}
      />
    );
  }

  const outcome = row.values
    ? row.warnings.length > 0
      ? `Will import, with ${row.warnings.length === 1 ? "a note" : `${row.warnings.length} notes`} below.`
      : "Ready to import."
    : `Will be skipped: ${row.error}.`;

  return (
    <div
      {...{ [ROW_EDITOR_ATTRIBUTE]: "" }}
      role="group"
      aria-label={`Edit row ${rowNumber}`}
      className="space-y-3 border-t border-border bg-background p-3 text-left text-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          role="status"
          className={cn(
            "font-medium",
            !row.values ? "text-red-900" : row.warnings.length > 0 ? "text-amber-900" : "text-green-800"
          )}
        >
          Row {rowNumber}: {outcome}
          {duplicate ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              {duplicate.kind === "existing"
                ? "It matches an application you track; you will choose what to do next."
                : `It repeats row ${duplicate.rowNumber}; you will choose what to do next.`}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">Changes apply as you type. Your file is not changed.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {IMPORT_FIELDS.map((field) => {
          const issues = issuesFor(field);
          const messageId = issues.length > 0 ? `${rowEditorFieldId(rowNumber, field)}-issues` : undefined;
          const changed = edits?.[field] !== undefined;
          return (
            <div key={field} className={cn("min-w-0 space-y-1", field === "notes" && "sm:col-span-2 lg:col-span-3")}>
              <Label htmlFor={rowEditorFieldId(rowNumber, field)} className="flex items-center gap-1.5 text-xs">
                {IMPORT_FIELD_LABELS[field]}
                {/* The space keeps the accessible name "Role *", as on the mapping step. */}
                {REQUIRED_IMPORT_FIELDS.includes(field) ? <span className="-ml-1.5 text-red-700"> *</span> : null}
                {changed ? <span className="font-normal text-blue-700">· edited</span> : null}
              </Label>
              {control(field, messageId, issues.length > 0)}
              {field === "status" && row.values && !row.values.statusFromFile && issues.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Imports as {statusLabel(row.values.status)}
                  {row.values.status === "applied" ? ", since it has an applied date" : ""}.
                </p>
              ) : null}
              {issues.length > 0 ? (
                <ul id={messageId} className="space-y-0.5 text-xs text-amber-950">
                  {issues.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" className="min-h-10" disabled={edited === 0} onClick={onUndo}>
          Undo changes to this row
        </Button>
        <Button type="button" size="sm" className="min-h-10" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
