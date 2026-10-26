import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import type { EntityListItem } from "@/domains/entities/types";
import { matchesChoice, matchesQ, memoryListPage } from "@/testing/memory-list";
import {
  buildEntityListConnection,
  buildEntityListItem,
} from "@/testing/records";
import { entityList } from "@watchdog/schemas/graph";
import type {
  EntityKind,
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

// The page read, and the whole-list reads the screen must never make.
const entityReads = vi.hoisted(() => ({
  listEntitiesPageFn: vi.fn(),
  getEntitiesFn: vi.fn(),
  createEntityFn: vi.fn(),
  updateEntityFieldsFn: vi.fn(),
}));
const edgeReads = vi.hoisted(() => ({
  listEdgesFn: vi.fn(),
  listEdgesForCaseFn: vi.fn(),
  createEdgeFn: vi.fn(),
  updateEdgeFn: vi.fn(),
  deleteEdgeFn: vi.fn(),
}));

vi.mock("@/domains/entities/entities.functions", () => entityReads);
vi.mock("@/domains/entities/edges/edges.functions", () => edgeReads);

import { EntityTable } from "@/domains/entities/components/entity-table";
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

const KINDS: readonly EntityKind[] = ["person", "org"];

/** `count` Entities: alternating person and org, names in a stable order, updated in reverse. */
function entities(count: number): EntityListItem[] {
  return Array.from({ length: count }, (_, n) =>
    buildEntityListItem({
      id: testId(1000 + n),
      kind: KINDS[n % 2] ?? "person",
      name: `subject ${String(n).padStart(3, "0")}`,
      slug: `subject-${String(n)}`,
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 60 - n)).toISOString(),
    })
  );
}

/** Five rows a page: enough to prove paging, small enough that each step renders fast. */
const PAGE_SIZE = 5;

function entityServer(rows: readonly EntityListItem[]) {
  return memoryListPage(rows, {
    pageSize: PAGE_SIZE,
    matches: (row, data) =>
      matchesChoice(row.kind, data.kind) &&
      matchesQ(data, [row.name, row.summary, row.notes]),
    compare: (sort) => (a, b) => {
      if (sort === "updated.desc")
        return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === "updated.asc") return a.updatedAt.localeCompare(b.updatedAt);
      return sort === "name.desc"
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name);
    },
  });
}

type Search = ListSearch<typeof entityList>;

/** The route's part: the view in "the URL" (state here), patched as `usePatchSearch` patches it. */
function Route({
  initial,
  onPatch,
}: {
  initial: Search;
  onPatch: (patch: UnfixedSearchPatch<typeof entityList, never>) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <EntityTable
      search={search}
      onSearchChange={(patch) => {
        onPatch(patch);
        setSearch((prev) => ({ ...prev, ...patch }));
      }}
    />
  );
}

function renderPage(rows: readonly EntityListItem[], initial: Search = {}) {
  entityReads.listEntitiesPageFn.mockReset();
  entityReads.listEntitiesPageFn.mockImplementation(entityServer(rows));
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
  const call: unknown = entityReads.listEntitiesPageFn.mock.lastCall?.[0];
  if (typeof call !== "object" || call === null || !("data" in call)) {
    throw new Error("no list request yet");
  }
  const { data } = call;
  if (typeof data !== "object" || data === null) throw new Error("no data");
  return { ...data };
}

beforeAll(preloadSharedLazyChunks);

describe("EntityTable (the list standard)", () => {
  it("loads one page, counts the total and pages with Load more", async () => {
    const user = userEvent.setup();
    renderPage(entities(8));
    expect(await screen.findByText("Showing 5 of 8")).toBeInTheDocument();
    expect(entityReads.listEntitiesPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ caseId: ACTIVE.id });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 8")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ caseId: ACTIVE.id, cursor: "5" });
  });

  it("shows each row's Connections from the row, with no Case-wide read", async () => {
    const rows = entities(3).map((row, n) => {
      if (n === 0) {
        return {
          ...row,
          connections: { outgoing: 1, incoming: 0 },
          soleConnection: buildEntityListConnection({
            fromId: row.id,
            peerName: "Acme Corp",
          }),
        };
      }
      if (n === 1) {
        return { ...row, connections: { outgoing: 2, incoming: 1 } };
      }
      return row;
    });
    renderPage(rows);

    expect(
      await screen.findByRole("button", {
        name: /Edit connection Associate of Acme Corp/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "3 connections" })
    ).toHaveAttribute("title", "2 outgoing, 1 incoming");
    expect(edgeReads.listEdgesForCaseFn).not.toHaveBeenCalled();
    expect(edgeReads.listEdgesFn).not.toHaveBeenCalled();
  });

  it("searches on the server and writes `q` to the URL", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(entities(20));
    await screen.findByText("Showing 5 of 20");

    // One paste, then blur: the search is written at once, with no debounce wait.
    await user.click(
      screen.getByRole("searchbox", { name: "Search entities" })
    );
    await user.paste("ject 01");
    await user.tab();
    await waitFor(() => {
      expect(onPatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "ject 01" })
      );
    });
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ q: "ject 01" });
    });
    expect(await screen.findByText("Showing 5 of 10")).toBeInTheDocument();
  });

  it("filters by Kind on the server from the Filters popover", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(entities(20));
    await screen.findByText("Showing 5 of 20");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Kind values" }));
    await user.click(await screen.findByRole("option", { name: "Org" }));

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: ["org"] })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ kind: ["org"] });
    });
    expect(await screen.findByText("Showing 5 of 10")).toBeInTheDocument();
  });

  it("sorts on the server from the declared columns' headers only", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(entities(20));
    await screen.findByText("Showing 5 of 20");
    // `name.asc` is the default: the header turns it around.
    await user.click(screen.getByRole("button", { name: /^Name/ }));

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "name.desc" })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "name.desc" });
    });
    expect(await screen.findByText("subject 019")).toBeInTheDocument();

    // Updated starts at its first declared direction, newest first.
    await user.click(screen.getByRole("button", { name: /^Updated/ }));
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "updated.desc" })
    );
    // Summary and Kind are not declared sorts: their headers never sort.
    expect(
      screen.queryByRole("button", { name: /^Summary/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Kind/ })
    ).not.toBeInTheDocument();
  });

  it("opens the view the URL names, chips and all, and its URL round-trips", async () => {
    const url: Search = { kind: ["org"], q: "subject 01", sort: "name.desc" };
    renderPage(entities(20), url);

    await screen.findByText("Showing 5");
    expect(entityReads.listEntitiesPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({
      caseId: ACTIVE.id,
      kind: ["org"],
      q: "subject 01",
      sort: "name.desc",
    });
    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(within(chips).getByText("Kind: Org")).toBeInTheDocument();

    // The route's schema reads back exactly the view the list writes.
    const schema = entityList.searchWith({});
    const query = entityList.queryOf(schema.parse(url));
    expect(
      entityList.queryOf(schema.parse(entityList.toSearch(query)))
    ).toEqual(query);
  });

  it("says “No entities yet” only when nothing exists, never while filtered", async () => {
    renderPage([]);
    expect(await screen.findByText("No Entities Yet")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });

  it("says “Nothing matches these filters” when a filter matches nothing", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(
      entities(4).filter((row) => row.kind === "person"),
      { kind: ["org"] }
    );
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Entities Yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: undefined })
    );
    expect(await screen.findByText("Showing 2")).toBeInTheDocument();
  });
});
