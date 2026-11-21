import { queryOptions } from "@tanstack/react-query";

import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import { orpc } from "@/lib/orpc-client";
import { listView } from "@/shared/lib/list/list-view";
import {
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeEntityScope,
  scopeEntityScopeEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { edgeList } from "@watchdog/schemas/graph";

/**
 * Connections keys are the oRPC procedure keys: `all(caseId)` is `[["edges"], { input: { caseId } }]`,
 * every Connections query of the Case whatever its procedure, filters or cursor.
 */
export const edgesKeys = {
  all: (caseId: string) => orpc.edges.key({ input: { caseId } }),
};

/**
 * The Graph reads (`graph.snapshot`, `graph.ego`): `all(caseId)` is every one of the Case. The
 * contracts that refresh the Case's Connections name it beside `edgesKeys.all`, so every Entity
 * and Connection change refreshes the Graph page and the Dossier ego graph.
 */
export const graphKeys = {
  all: (caseId: string) => orpc.graph.key({ input: { caseId } }),
};

/**
 * The Case's Connection list (`edgeList`, ADR-0007), a page at a time through `edges.list`: the
 * Dossier Connections tab and the Entities table's Connections popover are this list with
 * `entityId` fixed. Keys sit under `edgesKeys.all`, so every Entity, Connection and Proposal
 * change refreshes each view.
 */
export const edgeListView = listView(edgeList, {
  procedure: orpc.edges.list,
  scopeInput: ({ caseId }: { readonly caseId: string }) => ({
    caseId: scopeCaseId(caseId),
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  getId: (row: CaseEdgeRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

/**
 * One Connection by id (`edges.getMany`), or null when the Case no longer holds it. Disabled
 * without an id: the ego graph reads it only when a drawn Connection is not on a loaded page of
 * the list.
 */
export const edgeByIdQuery = (caseId: string, edgeId: string | null) => {
  const input = { caseId: scopeCaseId(caseId), ids: [edgeId ?? ""] };
  return queryOptions({
    queryKey: orpc.edges.getMany.key({ type: "query", input }),
    queryFn: async (): Promise<CaseEdgeRecord | null> => {
      if (edgeId === null) return null;
      const [row] = await orpc.edges.getMany.call(input);
      return row ?? null;
    },
    enabled: edgeId !== null && scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};

/**
 * The Dossier ego graph's capped read (#585, `graph.ego`): the Entity's most recently updated
 * Connections, cut on the server (`isTruncated`). One request, whatever the Entity's degree.
 */
export const graphEgoQuery = (caseId: string, entityId: string) => {
  const input = scopeEntityScope(caseId, entityId);
  const queryKey = orpc.graph.ego.queryKey({ input });
  return queryOptions({
    queryKey,
    queryFn: async () => orpc.graph.ego.call(input),
    enabled: scopeEntityScopeEnabled(caseId, entityId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/**
 * The Graph page's capped snapshot (#570, `graph.snapshot`): the Case's most connected Entities
 * and the Connections between them, cut on the server (`isTruncated`). One request, whatever the
 * Case's size.
 */
export const graphSnapshotQuery = (caseId: string) => {
  const input = { caseId: scopeCaseId(caseId) };
  const queryKey = orpc.graph.snapshot.queryKey({ input });
  return queryOptions({
    queryKey,
    queryFn: async () => orpc.graph.snapshot.call(input),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
