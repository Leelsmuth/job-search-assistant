import type { ReactNode } from "react";
import type { TrackedApplication } from "@/modules/applications/tracker";
import type { ImportSummary } from "@/modules/applications/tracker-csv";
import type { ImportCandidate, ImportRequest } from "@/modules/applications/tracker-import";

/**
 * Where an import goes. The dialog is the same for the public demo (browser
 * storage) and the signed-in tracker (the server); each provides a target.
 */
export type ImportTarget = {
  /** Applications already tracked, for matching duplicates and previewing updates. */
  existing:
    | { status: "loading" }
    | { status: "ready"; candidates: ImportCandidate[] }
    | { status: "error"; message: string; retry: () => void };
  /** Save the import. Must not throw: failures come back as an error outcome. */
  save: (request: ImportRequest) => Promise<ImportOutcome>;
  /** The whole tracker, for exporting right after an import. */
  exportApplications: () => Promise<TrackedApplication[]>;
  /** Where imported applications are kept, for the confirm step. */
  storageNote: ReactNode;
  /** Under the dialog title: what happens to the file. */
  description: string;
};

export type ImportOutcome =
  | {
      status: "imported";
      summary: Omit<ImportSummary, "skipInvalid"> & { unchanged: number };
      /** Put the tracker back as it was. Only the demo offers this. */
      undo?: () => void;
      /** Shown on the result screen, e.g. when the browser would not store the demo. */
      warning?: string;
    }
  /** A retry of an import that was already saved; nothing changed this time. */
  | { status: "already_imported" }
  | { status: "error"; message: string };
