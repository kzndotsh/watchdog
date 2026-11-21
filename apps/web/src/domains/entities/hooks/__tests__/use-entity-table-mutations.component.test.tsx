import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  edgeListView,
  graphEgoQuery,
  graphSnapshotQuery,
} from "@/domains/entities/edges/queries";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { useEntityTableMutations } from "@/domains/entities/hooks/use-entity-table-mutations";
import { procedureDouble } from "@/testing/orpc-client";
import { edgeList } from "@watchdog/domain/schemas/graph";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

const createEdge = procedureDouble("edges.create");
const deleteEdge = procedureDouble("edges.delete");

const CASE_ID = testCaseId(10);
const ALPHA = testId(1);
const BETA = testId(2);
const EDGE_ID = testId(3);

/** Every query the Entities table (and the Dossier connections tab) reads for a connection. */
const CONNECTION_QUERY_KEYS: readonly (readonly [string, QueryKey])[] = [
  ["the Case's entity list", entitiesKeys.all(CASE_ID)],
  ["the Graph page's snapshot", graphSnapshotQuery(CASE_ID).queryKey],
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
  ["the first endpoint's ego graph", graphEgoQuery(CASE_ID, ALPHA).queryKey],
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
    createEdge.mockResolvedValue({
      version: 1,
      id: EDGE_ID,
      fromId: ALPHA,
      toId: BETA,
      predicate: "associate_of",
      confidence: "unverified",
      notes: null,
      evidenceIds: [],
      peerId: BETA,
      peerName: "Beta",
      peerSlug: "beta",
      peerKind: "person",
      direction: "out",
    });
    const { queryClient, result } = setup();

    await act(async () => {
      await result.current.createConnection(ALPHA, {
        peerId: BETA,
        predicate: "associate_of",
        orientation: "forward",
      });
    });

    expect(createEdge).toHaveBeenCalledTimes(1);
    expectConnectionQueriesInvalidated(queryClient);
  });

  it("invalidates both endpoints and the table's data after an unlink", async () => {
    deleteEdge.mockResolvedValue({ ok: true });
    const { queryClient, result } = setup();

    await act(async () => {
      await result.current.deleteConnection(ALPHA, EDGE_ID);
    });

    expect(deleteEdge).toHaveBeenCalledTimes(1);
    expectConnectionQueriesInvalidated(queryClient);
  });
});
