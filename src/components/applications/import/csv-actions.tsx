"use client";

/**
 * Import and export buttons shared by the demo tracker and the signed-in
 * tracker. The import dialog itself is passed in and loaded on first use, so
 * the tracker page only carries these buttons and the export.
 */
import { useRef, useState, type ReactNode } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/use-toast";
import type { TrackedApplication } from "@/modules/applications/tracker";
import { exportFileName, exportTrackerCsv } from "@/modules/applications/tracker-csv";

/** Excel only reads a CSV as UTF-8 when it starts with a byte order mark. */
export function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function IconLabel({ icon: Icon, children }: { icon: typeof Upload; children: ReactNode }) {
  // Button wraps children in one span; keep the icon inline with the label.
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Download applications as a CSV, with a toast saying how many. */
export function useExportTracker() {
  const { toast } = useToast();
  return (applications: readonly TrackedApplication[]) => {
    const fileName = exportFileName();
    downloadCsv(exportTrackerCsv(applications), fileName);
    toast({ title: `Exported ${plural(applications.length, "application")}`, description: fileName });
  };
}

/** Downloads every tracked application, whatever the current filter. */
export function ExportCsvButton({ applications }: { applications: TrackedApplication[] }) {
  const exportTracker = useExportTracker();
  const empty = applications.length === 0;
  return (
    <span title={empty ? "Nothing to export yet" : undefined}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10"
        disabled={empty}
        onClick={() => exportTracker(applications)}
      >
        <IconLabel icon={Download}>Export CSV</IconLabel>
      </Button>
    </span>
  );
}

/**
 * Opens an import dialog. `renderDialog` is called while open and unmounted on
 * close, so every open starts a fresh import; `preload` fetches the dialog's
 * code as the visitor heads for the button.
 */
export function ImportCsvButton({
  preload,
  renderDialog,
}: {
  preload: () => unknown;
  renderDialog: (onClose: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10"
        aria-haspopup="dialog"
        onPointerEnter={() => void preload()}
        onFocus={() => void preload()}
        onClick={() => setOpen(true)}
      >
        <IconLabel icon={Upload}>Import CSV</IconLabel>
      </Button>
      {open
        ? renderDialog(() => {
            setOpen(false);
            // The dialog has no Radix trigger to return focus to, so do it here.
            requestAnimationFrame(() => buttonRef.current?.focus());
          })
        : null}
    </>
  );
}

/** Shown while the dialog's code loads on first open. */
export function ImportDialogLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="status">
      <span className="flex items-center gap-2 rounded-md bg-card px-4 py-3 text-sm shadow-lg">
        <Spinner className="h-4 w-4" />
        Loading import…
      </span>
    </div>
  );
}
