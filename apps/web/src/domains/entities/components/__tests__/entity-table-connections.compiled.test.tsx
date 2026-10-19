import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import { useEntityTableState } from "@/domains/entities/hooks/use-entity-table-state";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { DataTable } from "@/shared/ui/data-table";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/entities.functions", () => ({
  listEntitiesFn: vi.fn(),
  getEntityBySlugFn: vi.fn(),
}));

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  listEdgesFn: vi.fn(),
  listEdgesForCaseFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import type { useEntityTableMutations } from "@/domains/entities/hooks/use-entity-table-mutations";

// Runs under React Compiler (the `component-compiled` project), as the app ships.
// Linking or unlinking a connection refetches the Case's edges only: the entity list
// refetches to the same data, so every row keeps its identity and only the table meta
// (the peers each row's Connections cell reads) changes.

const ACTIVE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function entity(n: number, name: string, slug: string): EntityRecord {
  return {
    id: testId(n),
    caseId: ACTIVE.id,
    slug,
    name,
    kind: "person",
    summary: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const ALPHA = entity(1, "Alpha Entity", "alpha-entity");
const BETA = entity(2, "Beta Entity", "beta-entity");

const LINK: CaseEdgeRecord = {
  id: testId(3),
  fromId: ALPHA.id,
  fromName: ALPHA.name,
  fromSlug: ALPHA.slug,
  fromKind: "person",
  toId: BETA.id,
  toName: BETA.name,
  toSlug: BETA.slug,
  toKind: "person",
  predicate: "associate_of",
  confidence: "unverified",
  notes: null,
  evidenceIds: [],
};

const mutations: ReturnType<typeof useEntityTableMutations> = {
  updateKind: vi.fn(),
  updateSummary: vi.fn(),
  updateNotes: vi.fn(),
  createConnection: vi.fn().mockResolvedValue(undefined),
  updateConnection: vi.fn().mockResolvedValue(undefined),
  deleteConnection: vi.fn().mockResolvedValue(undefined),
  createEntity: vi.fn().mockResolvedValue(undefined),
};

function EntityTableHarness() {
  const { table, pending } = useEntityTableState(ACTIVE, mutations, vi.fn());
  return <DataTable table={table} isPending={pending} emptyText="Empty" />;
}

function renderTable(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<EntityTableHarness />, { wrapper });
}

function seededClient(edges: CaseEdgeRecord[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(entitiesListQuery(ACTIVE.id).queryKey, [ALPHA, BETA]);
  client.setQueryData(edgesForCaseQuery(ACTIVE.id).queryKey, edges);
  return client;
}

/** What the refetch after a link or unlink writes: the Case's edges; the entity rows are untouched. */
function setCaseEdges(client: QueryClient, edges: CaseEdgeRecord[]) {
  act(() => {
    client.setQueryData(edgesForCaseQuery(ACTIVE.id).queryKey, edges);
  });
}

describe("Entities table connections (compiled)", () => {
  it("shows a new connection on both endpoints' rows without a reload", async () => {
    const client = seededClient([]);
    renderTable(client);
    expect(
      screen.getByRole("button", { name: "Add connection for Alpha Entity" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add connection for Beta Entity" })
    ).toBeInTheDocument();

    setCaseEdges(client, [LINK]);

    expect(
      await screen.findByRole("button", {
        name: /Edit connection .*Beta Entity/,
      })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: /Edit connection .*Alpha Entity/,
      })
    ).toBeInTheDocument();
  });

  it("drops an unlinked connection from both endpoints' rows without a reload", async () => {
    const client = seededClient([LINK]);
    renderTable(client);
    expect(
      screen.getByRole("button", { name: /Edit connection .*Beta Entity/ })
    ).toBeInTheDocument();

    setCaseEdges(client, []);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Edit connection/ })
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Add connection for Alpha Entity" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add connection for Beta Entity" })
    ).toBeInTheDocument();
  });
});
