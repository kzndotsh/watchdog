import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { DossierConnectionsSearch } from "@/domains/dossier/lib/dossier-tabs";
import type {
  CaseEdgeRecord,
  EdgeRecord,
} from "@/domains/entities/edges/types";
import {
  lastListRequest,
  matchesChoice,
  matchesQ,
  memoryListPage,
} from "@/testing/memory-list";
import { buildCaseEdgeRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const { listEdgesPageFn, getEdgesFn, getGraphEgoFn } = vi.hoisted(() => ({
  listEdgesPageFn: vi.fn(),
  getEdgesFn: vi.fn(),
  getGraphEgoFn: vi.fn(),
}));

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  listEdgesPageFn,
  getEdgesFn,
  getGraphEgoFn,
  getGraphSnapshotFn: vi.fn(),
  createEdgeFn: vi.fn(),
  updateEdgeFn: vi.fn(),
  deleteEdgeFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/dossier/components/ego-graph/connection-dialog", () => ({
  ConnectionDialog: (props: { open: boolean; initial: EdgeRecord | null }) =>
    props.open ? (
      <div role="dialog" aria-label="Connection">
        {props.initial === null
          ? "New connection"
          : `Editing ${props.initial.peerName} (${props.initial.direction})`}
      </div>
    ) : null,
}));

vi.mock("@/domains/dossier/components/ego-graph/connection-list", () => ({
  CompactConnectionList: (props: {
    outbound: EdgeRecord[];
    inbound: EdgeRecord[];
  }) => (
    <ul aria-label="Connection list">
      {[...props.outbound, ...props.inbound].map((edge) => (
        <li key={edge.id}>{`${edge.direction} ${edge.peerName}`}</li>
      ))}
    </ul>
  ),
}));

vi.mock(
  "@/domains/dossier/components/ego-graph/ego-neighborhood-canvas",
  () => ({
    EgoNeighborhoodCanvas: (props: {
      edges: readonly { id: string; peer: { name: string } }[];
      onEditEdge?: (edgeId: string) => void;
    }) => (
      <div aria-label="Ego graph">
        {props.edges.map((edge) => (
          <button
            key={edge.id}
            type="button"
            onClick={() => props.onEditEdge?.(edge.id)}
          >
            {`Edge to ${edge.peer.name}`}
          </button>
        ))}
      </div>
    ),
  })
);

import { ConnectionsSection } from "@/domains/dossier/components/connections-section";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

const CASE_ID = testCaseId(10);
const ENTITY = {
  id: testId(1),
  name: "Alpha",
  slug: "alpha",
  kind: "person" as const,
};

/** `count` Connections of ALPHA: even ones outbound "owns", odd ones inbound "leads". */
function entityEdges(count: number): CaseEdgeRecord[] {
  return Array.from({ length: count }, (_, n) => {
    const peer = {
      id: testId(100 + n),
      name: `Peer ${String(n).padStart(2, "0")}`,
      slug: `peer-${String(n)}`,
    };
    const isOut = n % 2 === 0;
    return buildCaseEdgeRecord({
      id: testId(7000 + n),
      predicate: isOut ? "owns" : "leads",
      notes: n % 3 === 0 ? "seen in filings" : null,
      fromId: isOut ? ENTITY.id : peer.id,
      fromName: isOut ? ENTITY.name : peer.name,
      fromSlug: isOut ? ENTITY.slug : peer.slug,
      fromKind: "person",
      toId: isOut ? peer.id : ENTITY.id,
      toName: isOut ? peer.name : ENTITY.name,
      toSlug: isOut ? peer.slug : ENTITY.slug,
      toKind: "person",
    });
  });
}

function serve(rows: readonly CaseEdgeRecord[], egoMax = 50) {
  listEdgesPageFn.mockReset();
  listEdgesPageFn.mockImplementation(
    memoryListPage(rows, {
      pageSize: 5,
      matches: (row, data) =>
        matchesChoice(row.predicate, data.predicate) &&
        (data.entityId === undefined ||
          row.fromId === data.entityId ||
          row.toId === data.entityId) &&
        matchesQ(data, [row.notes]),
    })
  );
  getGraphEgoFn.mockReset();
  getGraphEgoFn.mockResolvedValue({
    edges: rows.slice(0, egoMax).map((row) => {
      const isOut = row.fromId === ENTITY.id;
      return {
        id: row.id,
        fromId: row.fromId,
        toId: row.toId,
        predicate: row.predicate,
        confidence: row.confidence,
        peer: {
          id: isOut ? row.toId : row.fromId,
          name: isOut ? row.toName : row.fromName,
          slug: isOut ? row.toSlug : row.fromSlug,
          kind: "person",
        },
      };
    }),
    isTruncated: rows.length > egoMax,
  });
}

const lastRequest = () => lastListRequest(listEdgesPageFn);

function TabSection({ initial }: { initial: DossierConnectionsSearch }) {
  const [search, setSearch] = useState(initial);
  return (
    <ConnectionsSection
      caseId={CASE_ID}
      entityId={ENTITY.id}
      entitySlug={ENTITY.slug}
      entity={ENTITY}
      emptyPresentation="panel"
      view={{
        search,
        onSearchChange: (patch) => {
          expect(patch).not.toHaveProperty("entityId");
          setSearch((prev) => ({ ...prev, ...patch }));
        },
      }}
    />
  );
}

function renderTab(
  rows: readonly CaseEdgeRecord[],
  initial: DossierConnectionsSearch = {},
  egoMax?: number
) {
  serve(rows, egoMax);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TabSection initial={initial} />
    </QueryClientProvider>
  );
}

beforeAll(preloadSharedLazyChunks);

describe("ConnectionsSection", () => {
  it("shows inline empty copy and add control when there are no edges", async () => {
    serve([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectionsSection
          caseId={CASE_ID}
          entityId={ENTITY.id}
          entitySlug={ENTITY.slug}
          entity={ENTITY}
        />
      </QueryClientProvider>
    );
    expect(
      await screen.findByText("No connections to other entities yet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(lastRequest()).toEqual({ caseId: CASE_ID, entityId: ENTITY.id });
  });

  it("pages the Entity's Connections at either end, oriented from the Entity", async () => {
    const user = userEvent.setup();
    renderTab([
      ...entityEdges(8),
      buildCaseEdgeRecord({
        id: testId(7999),
        fromId: testId(98),
        toId: testId(99),
      }),
    ]);
    expect(await screen.findByText("Showing 5 of 8")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Connection list" });
    expect(within(list).getByText("out Peer 00")).toBeInTheDocument();
    expect(within(list).getByText("in Peer 01")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 8")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ entityId: ENTITY.id, cursor: "5" });
  });

  it("searches, filters and sorts on the server, never offering the Entity", async () => {
    const user = userEvent.setup();
    renderTab(entityEdges(12));
    await screen.findByText("Showing 5 of 12");

    await user.click(
      screen.getByRole("searchbox", { name: "Search connections" })
    );
    await user.paste("filings");
    await user.tab();
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        q: "filings",
        entityId: ENTITY.id,
      });
    });
    expect(await screen.findByText("Showing 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter" }));
    expect(
      screen.queryByRole("option", { name: "Entity" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Predicate" }));
    await user.click(
      screen.getByRole("combobox", { name: "Predicate values" })
    );
    await user.click(await screen.findByRole("option", { name: "Owns" }));
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        predicate: ["owns"],
        q: "filings",
      });
    });
    expect(await screen.findByText("Showing 2")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Display options" }));
    await user.click(
      await screen.findByRole("radio", { name: /Updated, Newest/ })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "updated.desc" });
    });
  });

  it("opens the tab's view from the URL", async () => {
    renderTab(entityEdges(12), {
      predicate: ["leads"],
      sort: "predicate.desc",
    });
    expect(await screen.findByText("Showing 5 of 6")).toBeInTheDocument();
    // The view's page; the default view's first page is the tab's count (the Dossier shell
    // reads the same key for the tab label, so it is no extra request there).
    expect(listEdgesPageFn).toHaveBeenCalledWith({
      data: {
        caseId: CASE_ID,
        entityId: ENTITY.id,
        predicate: ["leads"],
        sort: "predicate.desc",
      },
    });
    expect(
      within(screen.getByRole("group", { name: "Active filters" })).getByText(
        "Predicate: Leads"
      )
    ).toBeInTheDocument();
  });

  it("tells a blank tab from a view that matches nothing", async () => {
    renderTab([]);
    expect(await screen.findByText("No Connections Yet")).toBeInTheDocument();
  });

  it("says “Nothing matches these filters” when the view matches nothing", async () => {
    renderTab(entityEdges(3), { q: "zzz-none" });
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Connections Yet")).not.toBeInTheDocument();
  });

  it("draws the server's capped star and says it was cut, with the tab's count", async () => {
    renderTab(entityEdges(8), {}, 3);
    expect(
      await screen.findByText(
        "Showing 3 of 8 connections, the most recently updated. The list beside it has them all."
      )
    ).toBeInTheDocument();
    expect(getGraphEgoFn).toHaveBeenCalledTimes(1);
    expect(getGraphEgoFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, entityId: ENTITY.id },
    });
  });

  it("edits a drawn Connection the list has not loaded by reading it by id", async () => {
    const user = userEvent.setup();
    const rows = entityEdges(8);
    renderTab(rows);
    await screen.findByText("Showing 5 of 8");
    const unloaded = rows[7];
    if (unloaded === undefined) throw new Error("fixture");
    getEdgesFn.mockResolvedValue([unloaded]);

    await user.click(screen.getByRole("button", { name: "Edge to Peer 07" }));
    expect(
      await screen.findByRole("dialog", { name: "Connection" })
    ).toHaveTextContent("Editing Peer 07 (in)");
    expect(getEdgesFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, ids: [unloaded.id] },
    });
  });
});
