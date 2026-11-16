// @vitest-environment jsdom
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ImportRequest } from "@/modules/applications/tracker-import";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  getImportCandidates: vi.fn(),
  importTrackedApplications: vi.fn(),
  listTrackedApplications: vi.fn(),
}));

const captured = vi.hoisted(() => ({
  save: null as ((request: unknown) => Promise<unknown>) | null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/server/actions/application-tracker-actions", () => ({
  getImportCandidates: mocks.getImportCandidates,
  importTrackedApplications: mocks.importTrackedApplications,
  listTrackedApplications: mocks.listTrackedApplications,
}));
vi.mock("@/components/applications/import/import-dialog", () => ({
  ImportDialog: (props: { target: { save: (request: unknown) => Promise<unknown> } }) => {
    captured.save = props.target.save;
    return null;
  },
}));

import { TrackerImportDialog } from "@/app/(dashboard)/applications/tracker-import-dialog";

const request: ImportRequest = {
  importId: "import-1",
  fileName: "jobs.csv",
  rows: [],
  resolutions: {},
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.clearAllMocks();
  captured.save = null;
  mocks.getImportCandidates.mockResolvedValue({ status: "ok", candidates: [] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(TrackerImportDialog, { onClose: () => {} }));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("refreshes the signed-in tracker after a spreadsheet import is saved", async () => {
  expect(captured.save).toEqual(expect.any(Function));

  mocks.importTrackedApplications.mockResolvedValueOnce({
    status: "imported",
    summary: { add: 2, update: 1, skipInvalid: 0, skipDuplicate: 1, unchanged: 0 },
  });
  await act(async () => {
    await captured.save!(request);
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);

  mocks.refresh.mockClear();
  mocks.importTrackedApplications.mockResolvedValueOnce({ status: "error", message: "The import failed." });
  await act(async () => {
    await captured.save!(request);
  });
  expect(mocks.refresh).not.toHaveBeenCalled();

  mocks.importTrackedApplications.mockResolvedValueOnce({ status: "already_imported" });
  await act(async () => {
    await captured.save!(request);
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
