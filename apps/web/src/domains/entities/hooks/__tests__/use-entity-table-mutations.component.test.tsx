import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { edgeListView, edgesKeys } from "@/domains/entities/edges/queries";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { useEntityTableMutations } from "@/domains/entities/hooks/use-entity-table-mutations";
import { edgeList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const createEdgeFn = vi.hoisted(() => vi.fn());
const deleteEdgeFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  createEdgeFn,
  updateEdgeFn: vi.fn(),
  deleteEdgeFn,
}));

vi.mock("@/domains/entities/entities.functions", () => ({
  createEntityFn: vi.fn(),
  updateEntityFieldsFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

const CASE_ID = testCaseId(10);
const ALPHA = testId(1);
const BETA = testId(2);
const EDGE_ID = testId(3);

/** Every query the Entities table (and the Dossier connections tab) reads for a connection. */
const CONNECTION_QUERY_KEYS: readonly (readonly [string, QueryKey])[] = [
  ["the Case's entity list", entitiesKeys.all(CASE_ID)],
  ["the Graph page's snapshot", edgesKeys.graphSnapshot(CASE_ID)],
  [
    "the first endpoint's Connections (Dossier)",
    edgeListView.key(
      { caseId: CASE_ID },
      edgeList.queryOf({}, { entityId: ALPHA })
    ),
  ],
  [
    "the second endpoint's Connections (Dossier)",
    edgeListView.key(
      { caseId: CASE_ID },
      edgeList.queryOf({}, { entityId: BETA })
    ),
  ],
  ["the first endpoint's ego graph", edgesKeys.graphEgo(CASE_ID, ALPHA)],
];

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  for (const [, key] of CONNECTION_QUERY_KEYS) {
    queryClient.setQueryData(key, []);
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useEntityTableMutations(CASE_ID), {
    wrapper,
  });
  return { queryClient, result };
}

function expectConnectionQueriesInvalidated(queryClient: QueryClient) {
  for (const [label, key] of CONNECTION_QUERY_KEYS) {
    expect(
      queryClient.getQueryState(key)?.isInvalidated,
      `${label} is invalidated`
    ).toBe(true);
  }
}

describe("useEntityTableMutations connection writes", () => {
  it("invalidates both endpoints and the table's data after a link", async () => {
    createEdgeFn.mockResolvedValue({ id: EDGE_ID });
    const { queryClient, result } = setup();

    await act(async () => {
      await result.current.createConnection(ALPHA, {
        peerId: BETA,
        predicate: "associate_of",
        orientation: "forward",
      });
    });

    expect(createEdgeFn).toHaveBeenCalledTimes(1);
    expectConnectionQueriesInvalidated(queryClient);
  });

  it("invalidates both endpoints and the table's data after an unlink", async () => {
    deleteEdgeFn.mockResolvedValue(undefined);
    const { queryClient, result } = setup();

    await act(async () => {
      await result.current.deleteConnection(ALPHA, EDGE_ID);
    });

    expect(deleteEdgeFn).toHaveBeenCalledTimes(1);
    expectConnectionQueriesInvalidated(queryClient);
  });
});
