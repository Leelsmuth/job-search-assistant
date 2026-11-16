"use client";

import dynamic from "next/dynamic";
import {
  ExportCsvButton,
  ImportCsvButton,
  ImportDialogLoading,
} from "@/components/applications/import/csv-actions";
import type { TrackedApplication } from "@/modules/applications/tracker";

/** The import dialog loads on first use; the tracker page only carries the buttons. */
const loadImportDialog = () => import("./tracker-import-dialog");
const TrackerImportDialog = dynamic(() => loadImportDialog().then((mod) => mod.TrackerImportDialog), {
  ssr: false,
  loading: ImportDialogLoading,
});

/** Import CSV and Export CSV for the signed-in tracker. */
export function TrackerCsvActions({ applications }: { applications: TrackedApplication[] }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Spreadsheet">
      <ImportCsvButton
        preload={loadImportDialog}
        renderDialog={(onClose) => <TrackerImportDialog onClose={onClose} />}
      />
      <ExportCsvButton applications={applications} />
    </div>
  );
}
