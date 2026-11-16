"use client";

/**
 * The import dialog for the signed-in tracker: it saves to the user's account.
 * Loaded only when the user opens Import CSV.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportDialog } from "@/components/applications/import/import-dialog";
import type { ImportTarget } from "@/components/applications/import/types";
import type { ImportCandidate } from "@/modules/applications/tracker-import";
import {
  getImportCandidates,
  importTrackedApplications,
  listTrackedApplications,
} from "@/server/actions/application-tracker-actions";

const UNREACHABLE = "Could not reach the server, so duplicates cannot be checked. Check your connection and try again.";

export function TrackerImportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [existing, setExisting] = useState<
    { status: "loading" } | { status: "ready"; candidates: ImportCandidate[] } | { status: "error"; message: string }
  >({ status: "loading" });

  // The applications already tracked, fetched fresh each time the dialog opens.
  const load = useCallback(() => {
    setExisting({ status: "loading" });
    getImportCandidates()
      .then((result) =>
        setExisting(
          result.status === "ok"
            ? { status: "ready", candidates: result.candidates }
            : { status: "error", message: result.message }
        )
      )
      .catch(() => setExisting({ status: "error", message: UNREACHABLE }));
  }, []);
  useEffect(load, [load]);

  const target: ImportTarget = {
    existing: existing.status === "error" ? { ...existing, retry: load } : existing,
    description:
      "Bring in the roles you already track. The file is read in your browser; the rows you import are saved to your account.",
    storageNote: (
      <>
        Everything is saved to your account in one step: if anything goes wrong, nothing is saved.
        Each application gets an “Imported from spreadsheet” entry in its history, and imported jobs
        stay out of your job feed and daily digest.
      </>
    ),
    async save(request) {
      // A thrown error here means the request may not have reached the server; the dialog
      // handles that, and the request id makes a retry safe.
      const result = await importTrackedApplications(request);
      if (result.status === "imported" || result.status === "already_imported") {
        router.refresh();
      }
      if (result.status === "imported") {
        const { skipInvalid: _skipInvalid, ...summary } = result.summary;
        return { status: "imported", summary };
      }
      return result;
    },
    exportApplications: () => listTrackedApplications(),
  };

  return <ImportDialog target={target} onClose={onClose} />;
}
