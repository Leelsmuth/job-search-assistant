"use client";

/**
 * The import dialog for the public demo: it saves to the demo's browser store.
 * Loaded only when a visitor opens Import CSV.
 */
import { useMemo } from "react";
import { ImportDialog } from "@/components/applications/import/import-dialog";
import type { ImportTarget } from "@/components/applications/import/types";
import { requestRowResults } from "@/modules/applications/tracker-import";
import { demoImportCandidates } from "@/modules/demo/demo-import";
import { listDemoTrackedApplications } from "@/modules/demo/demo-state";
import { demoActions, useDemoState } from "../demo-store";

const NOT_SAVED =
  "This browser would not let the demo save the import, so it will be gone when you reload or close the tab. Export a CSV now to keep a copy.";

export function DemoImportDialog({ onClose }: { onClose: () => void }) {
  // The live demo state, so a change in another tab shows up in the duplicates.
  const state = useDemoState();
  const candidates = useMemo(() => (state ? demoImportCandidates(state) : null), [state]);

  const target: ImportTarget = {
    existing: candidates ? { status: "ready", candidates } : { status: "loading" },
    description: "Bring in the roles you already track. The file is read in this browser and never uploaded.",
    storageNote: (
      <>
        Imported applications stay in this browser, like the rest of the demo. You can undo the import
        right after, and <span className="font-medium text-foreground">Reset demo</span> removes them.
      </>
    ),
    async save(request) {
      try {
        const result = demoActions.importRows(requestRowResults(request), request.resolutions);
        const { skipInvalid: _skipInvalid, ...summary } = result.summary;
        return {
          status: "imported",
          summary,
          undo: () => demoActions.restore(result.previous),
          warning: result.persisted ? undefined : NOT_SAVED,
        };
      } catch (error) {
        return {
          status: "error",
          message: `${error instanceof Error ? error.message : "The import failed."} Nothing was imported.`,
        };
      }
    },
    async exportApplications() {
      return state ? listDemoTrackedApplications(state) : [];
    },
  };

  return <ImportDialog target={target} onClose={onClose} />;
}
