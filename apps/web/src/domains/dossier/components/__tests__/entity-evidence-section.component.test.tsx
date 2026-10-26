import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  evidenceTabView,
  parseDossierSearch,
  type DossierEvidenceSearch,
} from "@/domains/dossier/lib/dossier-tabs";
import type { EvidenceRecord } from "@/domains/intake/types";
import { matchesChoice, matchesQ, memoryListPage } from "@/testing/memory-list";
import { buildEvidenceRecord } from "@/testing/records";
import { evidenceList } from "@watchdog/schemas/evidence";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/domains/intake/hooks/use-dump-evidence", () => ({
  useDumpEvidence: () => ({
    busy: false,
    uploading: false,
    dumpingPaste: false,
    dumpingUrl: false,
    uploadStatus: null,
    dumpError: null,
    onFiles: vi.fn(),
    onPaste: vi.fn(),
    onUrl: vi.fn(),
  }),
}));

vi.mock("@/domains/intake/components/file-drop-zone", () => ({
  FileDropZone: () => <div>Drop zone</div>,
}));

vi.mock("@/domains/intake/components/dump-dialogs", () => ({
  DumpDialogs: () => null,
}));

const listEvidencePageFn = vi.hoisted(() => vi.fn());
const getEvidenceFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/intake/intake.functions", () => ({
  listEvidencePageFn,
  getEvidenceFn,
  getEvidenceDownloadUrlFn: vi.fn().mockResolvedValue({ url: null }),
}));

import { EntityEvidenceSection } from "@/domains/dossier/components/entity-evidence-section";
import { TOAST_EVIDENCE_SELECTION_GONE } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import { preloadListPopovers } from "@/testing/list-popovers";

const CASE_ID = testCaseId(10);
const ENTITY_ID = testId(20);
const OTHER_ENTITY_ID = testId(21);

/** `count` Evidence items of the Entity, newest first by capture time. */
function entityEvidence(count: number): EvidenceRecord[] {
  return Array.from({ length: count }, (_, n) =>
    buildEvidenceRecord({
      id: testId(2000 + n),
      entityId: ENTITY_ID,
      kind: n % 2 === 0 ? "attestation" : "url_archive",
      label: `Dump ${String(n).padStart(3, "0")}`,
      capturedAt: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
    })
  );
}

/** The server's side of the Evidence list over `rows` (the hidden view holds none). */
function evidenceServer(rows: readonly EvidenceRecord[]) {
  return memoryListPage(rows, {
    matches: (row, data) =>
      data.hidden !== true &&
      (data.unprocessed !== true || row.processedAt === null) &&
      matchesChoice(row.kind, data.kind) &&
      (data.entityId === undefined || data.entityId === row.entityId) &&
      matchesQ(data, [row.label, row.notes, row.sourceUrl]),
    compare: (sort) => (a, b) =>
      sort === "captured.asc"
        ? a.capturedAt.localeCompare(b.capturedAt)
        : b.capturedAt.localeCompare(a.capturedAt),
  });
}

type Patch = Readonly<Record<string, unknown>>;

/** The Dossier route's part: the tab's view and selection in "the URL" (state here). */
function Tab({
  initial,
  onPatch,
}: {
  initial: DossierEvidenceSearch;
  onPatch: (patch: Patch) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <EntityEvidenceSection
      caseId={CASE_ID}
      entityId={ENTITY_ID}
      search={search}
      onSearchChange={(patch) => {
        onPatch(patch);
        setSearch((prev) => ({ ...prev, ...patch }));
      }}
    />
  );
}

function renderTab(
  rows: readonly EvidenceRecord[],
  initial: DossierEvidenceSearch = {}
) {
  listEvidencePageFn.mockReset();
  listEvidencePageFn.mockImplementation(evidenceServer(rows));
  getEvidenceFn.mockReset();
  getEvidenceFn.mockImplementation(
    async ({ data }: { data: { evidenceId: string } }) => {
      // Not in the Case: the ServerFn answers null (`orpcNullIfNotFound`).
      return rows.find((row) => row.id === data.evidenceId) ?? null;
    }
  );
  const onPatch = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Tab initial={initial} onPatch={onPatch} />
    </QueryClientProvider>
  );
  return { onPatch };
}

function lastRequest(): Record<string, unknown> {
  const call: unknown = listEvidencePageFn.mock.lastCall?.[0];
  if (typeof call !== "object" || call === null || !("data" in call)) {
    throw new Error("no list request yet");
  }
  const { data } = call;
  if (typeof data !== "object" || data === null) throw new Error("no data");
  return { ...data };
}

beforeAll(preloadListPopovers);

describe("Dossier Evidence tab (the list standard)", () => {
  it("reads one page of this Entity's Evidence, never the whole Case", async () => {
    const user = userEvent.setup();
    const rows = [
      ...entityEvidence(60),
      buildEvidenceRecord({ id: testId(2999), entityId: OTHER_ENTITY_ID }),
    ];
    renderTab(rows);
    expect(await screen.findByText("Showing 50 of 60")).toBeInTheDocument();
    expect(listEvidencePageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ caseId: CASE_ID, entityId: ENTITY_ID });
    // Newest first, the declared default.
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Dump 059");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 60")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ entityId: ENTITY_ID, cursor: "50" });
  });

  it("searches on the server, keeping the Entity fixed and out of the URL", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityEvidence(60));
    await screen.findByText("Showing 50 of 60");

    // One paste, then blur: the search is written at once, with no debounce wait.
    await user.click(
      screen.getByRole("searchbox", { name: "Search evidence" })
    );
    await user.paste("Dump 04");
    await user.tab();
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        q: "Dump 04",
        entityId: ENTITY_ID,
      });
    });
    expect(await screen.findByText("Showing 10")).toBeInTheDocument();
    for (const [patch] of onPatch.mock.calls) {
      expect(patch).not.toHaveProperty("entityId");
    }
  });

  it("filters and sorts on the server, never offering Entity or Unattached", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityEvidence(12));
    await screen.findByText("Showing 12");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter" }));
    expect(
      screen.queryByRole("option", { name: "Entity" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Unattached" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Kind" }));
    await user.click(screen.getByRole("combobox", { name: "Kind values" }));
    await user.click(
      await screen.findByRole("option", { name: "URL Archive" })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        kind: ["url_archive"],
        entityId: ENTITY_ID,
      });
    });
    expect(await screen.findByText("Showing 6")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Display options" }));
    await user.click(
      await screen.findByRole("radio", { name: /Captured, Oldest/ })
    );
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "captured.asc" })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "captured.asc" });
    });
  });

  it("opens the URL's view, and the URL round-trips without the fixed Entity", async () => {
    renderTab(entityEvidence(60), { kind: ["attestation"], q: "Dump 01" });
    expect(await screen.findByText("Showing 5")).toBeInTheDocument();
    expect(lastRequest()).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY_ID,
      kind: ["attestation"],
      q: "Dump 01",
    });

    // The Dossier route reads back exactly the view the tab writes, without the fixed Entity.
    const query = evidenceList.queryOf(
      { kind: ["attestation"], q: "Dump 01" },
      { entityId: ENTITY_ID }
    );
    const url = evidenceList.toSearch(query, { entityId: ENTITY_ID });
    expect(url).not.toHaveProperty("entityId");
    expect(url).toEqual(
      expect.objectContaining({ kind: ["attestation"], q: "Dump 01" })
    );
    const routed = evidenceTabView(
      parseDossierSearch({
        tab: "evidence",
        kind: ["attestation"],
        q: "Dump 01",
      })
    );
    // A hand-typed `entityId` in the address bar never reaches the fixed filter.
    const handTyped = { tab: "evidence", entityId: testId(99) };
    expect(evidenceTabView(parseDossierSearch(handTyped))).not.toHaveProperty(
      "entityId"
    );
    expect(evidenceList.queryOf(routed, { entityId: ENTITY_ID })).toEqual(
      query
    );
  });

  it("says “No evidence yet” for an Entity without Evidence, never while filtered", async () => {
    renderTab([]);
    expect(await screen.findByText("No Evidence Yet")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });

  it("says “Nothing matches these filters” when a search matches nothing", async () => {
    renderTab(entityEvidence(3), { q: "zzz-none" });
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Evidence Yet")).not.toBeInTheDocument();
  });

  it("selects a loaded row into the URL without asking the server for it", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityEvidence(3));
    await user.click(await screen.findByRole("option", { name: /Dump 001/ }));

    expect(onPatch).toHaveBeenLastCalledWith({ id: testId(2001) });
    expect(
      await screen.findByRole("dialog", { name: "Dump 001" })
    ).toBeInTheDocument();
    expect(getEvidenceFn).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onPatch).toHaveBeenLastCalledWith({ id: undefined });
  });

  it("resolves a URL-selected row that is not on the first page through evidence.get", async () => {
    const rows = entityEvidence(60);
    // Newest first: Dump 000 is on the second page.
    renderTab(rows, { id: testId(2000) });

    expect(
      await screen.findByRole("dialog", { name: "Dump 000" })
    ).toBeInTheDocument();
    expect(getEvidenceFn).toHaveBeenCalledTimes(1);
    expect(getEvidenceFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, evidenceId: testId(2000) },
    });
    expect(listEvidencePageFn).toHaveBeenCalledTimes(1);
  });

  it("asks for no Evidence by id without a selection", async () => {
    renderTab(entityEvidence(3));
    await screen.findByText("Showing 3");
    expect(getEvidenceFn).not.toHaveBeenCalled();
  });

  it("reads a URL selection by id only after the first page lands without it", async () => {
    // Newest first: Dump 059 is on page one, so the link costs no second request.
    renderTab(entityEvidence(60), { id: testId(2059) });
    expect(
      await screen.findByRole("dialog", { name: "Dump 059" })
    ).toBeInTheDocument();
    expect(getEvidenceFn).not.toHaveBeenCalled();
  });

  it("shows the error with Retry and Clear selection when the by-id read fails", async () => {
    const user = userEvent.setup();
    renderTab(entityEvidence(60), { id: testId(2000) });
    getEvidenceFn.mockReset();
    getEvidenceFn.mockRejectedValueOnce(new Error("Couldn't reach the server"));
    getEvidenceFn.mockResolvedValueOnce(entityEvidence(1)[0]);

    expect(
      await screen.findByText("Couldn't reach the server")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Dump 000" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("dialog", { name: "Dump 000" })
    ).toBeInTheDocument();
    expect(getEvidenceFn).toHaveBeenCalledTimes(2);
  });

  it("clears the selection from the error state", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityEvidence(60), { id: testId(2000) });
    getEvidenceFn.mockReset();
    getEvidenceFn.mockRejectedValue(new Error("Couldn't reach the server"));

    await user.click(
      await screen.findByRole("button", { name: "Clear selection" })
    );
    expect(onPatch).toHaveBeenLastCalledWith({ id: undefined });
    await waitFor(() => {
      expect(
        screen.queryByText("Couldn't reach the server")
      ).not.toBeInTheDocument();
    });
  });

  it("drops a selection the Case no longer holds, with a notice", async () => {
    const { onPatch } = renderTab(entityEvidence(60), { id: testId(9999) });
    await waitFor(() => {
      expect(onPatch).toHaveBeenLastCalledWith({ id: undefined });
    });
    expect(toast.info).toHaveBeenCalledWith(TOAST_EVIDENCE_SELECTION_GONE);
    expect(getEvidenceFn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
