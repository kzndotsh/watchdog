import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { matchesChoice, matchesQ, memoryListPage } from "@/testing/memory-list";
import {
  buildCaseIdentifierRecord,
  buildEntityRecord,
} from "@/testing/records";
import { identifierList } from "@watchdog/schemas/graph";
import type {
  IdentifierType,
  ListSearch,
  UnfixedSearchPatch,
} from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/domains/entities/components/bulk-add-identifiers-dialog", () => ({
  BulkAddIdentifiersDialog: ({ open }: { open: boolean }) =>
    open ? <div>Bulk identifiers dialog</div> : null,
}));

const listIdentifiersPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  listIdentifiersPageFn,
  createIdentifierFn: vi.fn(),
  updateIdentifierFn: vi.fn(),
  deleteIdentifierFn: vi.fn(),
}));

// The pickers' reads (#559): one small page and by-ids. The whole-list reads stay spies that
// the screen must never call.
const entityReads = vi.hoisted(() => ({
  listEntitiesPickerPageFn: vi.fn(),
  getEntitiesFn: vi.fn(),
}));
const evidenceReads = vi.hoisted(() => ({
  listEvidenceFn: vi.fn(),
  listEvidencePageFn: vi.fn(),
  listEvidencePickerPageFn: vi.fn(),
  getEvidenceManyFn: vi.fn(),
}));

vi.mock("@/domains/entities/entities.functions", () => entityReads);
vi.mock("@/domains/intake/intake.functions", () => evidenceReads);

import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";
import { renderIn } from "@/testing/render-in-case";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

const ACTIVE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const render = renderIn(ACTIVE);

const TYPES: readonly IdentifierType[] = ["email", "phone"];

/** `count` Identifiers: alternating email and phone, values in a stable order. */
function identifiers(count: number): CaseIdentifierRecord[] {
  return Array.from({ length: count }, (_, n) =>
    buildCaseIdentifierRecord({
      id: testId(1000 + n),
      type: TYPES[n % 2] ?? "email",
      value: `contact${String(n).padStart(3, "0")}@example.com`,
    })
  );
}

/** The server's side of the Identifier list over `rows`. */
/** Five rows a page: enough to prove paging, small enough that each step renders fast. */
const PAGE_SIZE = 5;

function identifierServer(rows: readonly CaseIdentifierRecord[]) {
  return memoryListPage(rows, {
    pageSize: PAGE_SIZE,
    matches: (row, data) =>
      matchesChoice(row.type, data.type) &&
      matchesChoice(row.status, data.status) &&
      matchesChoice(row.confidence, data.confidence) &&
      (data.entityId === undefined || data.entityId === row.entityId) &&
      matchesQ(data, [row.value, row.platform, row.notes]),
    compare: (sort) => (a, b) =>
      sort === "value.desc"
        ? b.value.localeCompare(a.value)
        : a.value.localeCompare(b.value),
  });
}

type Search = ListSearch<typeof identifierList>;

/** The route's part: the view in "the URL" (state here), patched as `usePatchSearch` patches it. */
function Route({
  initial,
  onPatch,
}: {
  initial: Search;
  onPatch: (patch: UnfixedSearchPatch<typeof identifierList, never>) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <IdentifiersPage
      search={search}
      onSearchChange={(patch) => {
        onPatch(patch);
        setSearch((prev) => ({ ...prev, ...patch }));
      }}
    />
  );
}

const ACME = buildEntityRecord({ id: testId(50), name: "Acme Corp" });

function renderPage(
  rows: readonly CaseIdentifierRecord[],
  initial: Search = {}
) {
  entityReads.listEntitiesPickerPageFn.mockResolvedValue({
    items: [ACME],
    nextCursor: null,
    total: { count: 1, isCapped: false },
  });
  entityReads.getEntitiesFn.mockResolvedValue([ACME]);
  evidenceReads.listEvidencePickerPageFn.mockResolvedValue({
    items: [],
    nextCursor: null,
    total: { count: 0, isCapped: false },
  });
  evidenceReads.getEvidenceManyFn.mockResolvedValue([]);
  listIdentifiersPageFn.mockReset();
  listIdentifiersPageFn.mockImplementation(identifierServer(rows));
  const onPatch = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Route initial={initial} onPatch={onPatch} />
    </QueryClientProvider>
  );
  return { onPatch };
}

/** The params of the last page the screen asked for. */
function lastRequest(): Record<string, unknown> {
  const call: unknown = listIdentifiersPageFn.mock.lastCall?.[0];
  if (typeof call !== "object" || call === null || !("data" in call)) {
    throw new Error("no list request yet");
  }
  const { data } = call;
  if (typeof data !== "object" || data === null) throw new Error("no data");
  return { ...data };
}

beforeAll(preloadSharedLazyChunks);

describe("IdentifiersPage (the list standard)", () => {
  it("reads no whole-Case list: the Entity filter's chip is titled by id", async () => {
    renderPage(identifiers(3), { entityId: ACME.id });
    expect(
      await screen.findByText(/Acme Corp/, { selector: "span" })
    ).toBeInTheDocument();
    expect(entityReads.getEntitiesFn).toHaveBeenCalledWith({
      data: { caseId: ACTIVE.id, ids: [ACME.id] },
    });
    expect(evidenceReads.listEvidenceFn).not.toHaveBeenCalled();
  });

  it("asks for the Entity filter's page only once the Filters popover opens", async () => {
    const user = userEvent.setup();
    renderPage(identifiers(3), { entityId: ACME.id });
    // The chip is titled by id (getMany); the options page waits for the popover.
    expect(
      await screen.findByText(/Acme Corp/, { selector: "span" })
    ).toBeInTheDocument();
    expect(entityReads.listEntitiesPickerPageFn).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await screen.findByRole("combobox", { name: "Entity value" });
    await waitFor(() => {
      expect(entityReads.listEntitiesPickerPageFn).toHaveBeenCalledTimes(1);
    });
    expect(entityReads.listEntitiesPickerPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({ caseId: ACTIVE.id, limit: 20 }),
    });
  });

  it("loads one page, counts the total and pages with Load more", async () => {
    const user = userEvent.setup();
    renderPage(identifiers(8));
    expect(await screen.findByText("Showing 5 of 8")).toBeInTheDocument();
    expect(listIdentifiersPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ caseId: ACTIVE.id });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 8")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ caseId: ACTIVE.id, cursor: "5" });
  });

  it("searches on the server and writes `q` to the URL", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(identifiers(20));
    await screen.findByText("Showing 5 of 20");

    // One paste, then blur: the search is written at once, with no debounce wait.
    await user.click(
      screen.getByRole("searchbox", { name: "Search identifiers" })
    );
    await user.paste("ct01");
    await user.tab();
    await waitFor(() => {
      expect(onPatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "ct01" })
      );
    });
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ q: "ct01" });
    });
    expect(await screen.findByText("Showing 5 of 10")).toBeInTheDocument();
  });

  it("filters on the server from the Filters popover", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(identifiers(20));
    await screen.findByText("Showing 5 of 20");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    // Type is the first declared filter: pick Phone.
    await user.click(screen.getByRole("combobox", { name: "Type values" }));
    await user.click(await screen.findByRole("option", { name: "Phone" }));

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: ["phone"] })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ type: ["phone"] });
    });
    expect(await screen.findByText("Showing 5 of 10")).toBeInTheDocument();
  });

  it("sorts on the server from a declared column's header", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(identifiers(20));
    await screen.findByText("Showing 5 of 20");
    // `value.asc` is the default: the header turns it around.
    await user.click(screen.getByRole("button", { name: /^Value/ }));

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "value.desc" })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "value.desc" });
    });
    expect(
      await screen.findByDisplayValue("contact019@example.com")
    ).toBeInTheDocument();
    // The Entity column is not a declared sort: its header never sorts.
    expect(
      screen.queryByRole("button", { name: /^Entity/ })
    ).not.toBeInTheDocument();

    // Created starts at its first declared direction, newest first.
    await user.click(screen.getByRole("button", { name: /^Created/ }));
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "created.desc" })
    );
  });

  it("sorts only from the headers: Display options has no Sort list on a table", async () => {
    const user = userEvent.setup();
    renderPage(identifiers(3));
    await screen.findByText("Showing 3");
    await user.click(screen.getByRole("button", { name: /Display options/ }));
    expect(await screen.findByText("Columns")).toBeInTheDocument();
    expect(screen.queryByText("Sort")).not.toBeInTheDocument();
  });

  it("opens the view the URL names, chips and all, and its URL round-trips", async () => {
    const url: Search = { type: ["phone"], q: "contact01", sort: "value.desc" };
    renderPage(identifiers(20), url);

    await screen.findByText("Showing 5");
    expect(listIdentifiersPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({
      caseId: ACTIVE.id,
      type: ["phone"],
      q: "contact01",
      sort: "value.desc",
    });
    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(within(chips).getByText("Type: Phone")).toBeInTheDocument();

    // The route's schema reads back exactly the view the list writes.
    const schema = identifierList.searchWith({});
    const query = identifierList.queryOf(schema.parse(url));
    expect(
      identifierList.queryOf(schema.parse(identifierList.toSearch(query)))
    ).toEqual(query);
  });

  it("says “No identifiers yet” only when nothing exists, never while filtered", async () => {
    renderPage([]);
    expect(await screen.findByText("No Identifiers Yet")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });

  it("says “Nothing matches these filters” when a filter matches nothing", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(identifiers(4), { status: ["former"] });
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Identifiers Yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined })
    );
    expect(await screen.findByText("Showing 4")).toBeInTheDocument();
  });

  it("spans every column with the composer row, the trailing actions column included", async () => {
    const user = userEvent.setup();
    renderPage([]);
    await user.click(
      await screen.findByRole("button", { name: "Add identifier…" })
    );
    const submit = await screen.findByRole("button", { name: "Save" });
    const row = submit.closest("tr");
    if (row === null) throw new Error("no composer row");
    const spanned = [...row.cells].reduce((sum, cell) => sum + cell.colSpan, 0);
    const headerCells = screen.getAllByRole("columnheader").length;
    expect(spanned).toBe(headerCells);
  });

  it("keeps the screen's own actions in the toolbar", async () => {
    const user = userEvent.setup();
    renderPage([]);
    await user.click(await screen.findByRole("button", { name: "Bulk add" }));
    expect(
      await screen.findByText("Bulk identifiers dialog")
    ).toBeInTheDocument();
  });
});
