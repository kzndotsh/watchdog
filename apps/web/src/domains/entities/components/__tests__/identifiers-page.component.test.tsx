import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { matchesChoice, matchesQ, memoryListPage } from "@/testing/memory-list";
import { buildCaseIdentifierRecord } from "@/testing/records";
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
  listIdentifiersForCaseFn: vi.fn(),
  createIdentifierFn: vi.fn(),
  updateIdentifierFn: vi.fn(),
  deleteIdentifierFn: vi.fn(),
}));

vi.mock("@/domains/entities/entities.functions", () => ({
  listEntitiesFn: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/domains/intake/intake.functions", () => ({
  listEvidenceFn: vi.fn().mockResolvedValue([]),
}));

import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";
import { renderIn } from "@/testing/render-in-case";

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
function identifierServer(rows: readonly CaseIdentifierRecord[]) {
  return memoryListPage(rows, {
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

function renderPage(
  rows: readonly CaseIdentifierRecord[],
  initial: Search = {}
) {
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

describe("IdentifiersPage (the list standard)", () => {
  it("loads one page, counts the total and pages with Load more", async () => {
    const user = userEvent.setup();
    renderPage(identifiers(60));
    expect(await screen.findByText("Showing 50 of 60")).toBeInTheDocument();
    expect(listIdentifiersPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ caseId: ACTIVE.id });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 60")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ caseId: ACTIVE.id, cursor: "50" });
  });

  it("searches on the server and writes `q` to the URL", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(identifiers(20));
    await screen.findByText("Showing 20");

    await user.type(
      screen.getByRole("searchbox", { name: "Search identifiers" }),
      "ct01"
    );
    await waitFor(() => {
      expect(onPatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "ct01" })
      );
    });
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ q: "ct01" });
    });
    expect(await screen.findByText("Showing 10")).toBeInTheDocument();
  });

  it("filters on the server from the Filters popover", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(identifiers(20));
    await screen.findByText("Showing 20");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    // Type is the first declared filter: pick Phone.
    await user.click(screen.getByRole("combobox", { name: "Type values" }));
    await user.click(await screen.findByRole("option", { name: "Phone" }));

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: ["phone"] })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ type: ["phone"] });
    });
    expect(await screen.findByText("Showing 10")).toBeInTheDocument();
  });

  it("sorts on the server from a declared column's header", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(identifiers(20));
    await screen.findByText("Showing 20");
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
  });

  it("opens the view the URL names, chips and all, and its URL round-trips", async () => {
    const url: Search = { type: ["phone"], q: "contact01", sort: "value.desc" };
    renderPage(identifiers(60), url);

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

  it("keeps the screen's own actions in the toolbar", async () => {
    const user = userEvent.setup();
    renderPage([]);
    await user.click(await screen.findByRole("button", { name: "Bulk add" }));
    expect(screen.getByText("Bulk identifiers dialog")).toBeInTheDocument();
  });
});
