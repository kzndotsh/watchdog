import { queryOptions } from "@tanstack/react-query";

import {
  getEdgesFn,
  getGraphEgoFn,
  getGraphSnapshotFn,
  listEdgesPageFn,
} from "@/domains/entities/edges/edges.functions";
import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import { listView } from "@/shared/lib/list/list-view";
import {
  parseCaseScopeInput,
  parseEntityScopeInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeEntityScope,
  scopeEntityScopeEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { edgeList } from "@watchdog/schemas/graph";

export const edgesKeys = {
  prefix: (caseId: string) => ["edges", caseId] as const,
  /** The Graph page's snapshot: under the Case prefix, so every Entity and Connection change refreshes it. */
  graphSnapshot: (caseId: string) =>
    ["edges", caseId, "graph-snapshot"] as const,
  /** One Entity's ego graph: under the Case prefix, like the snapshot. */
  graphEgo: (caseId: string, entityId: string) =>
    ["edges", caseId, "graph-ego", entityId] as const,
  /** Connections read by id (the ego graph's edit of a row not loaded). */
  byId: (caseId: string, edgeId: string) =>
    ["edges", caseId, "by-id", edgeId] as const,
};

/**
 * The Case's Connection list (`edgeList`, ADR-0007), a page at a time: the Dossier Connections
 * tab and the Entities table's Connections popover are this list with `entityId` fixed. Keys sit
 * under `edgesKeys.prefix`, so every Entity, Connection and Proposal change refreshes each view.
 */
export const edgeListView = listView(edgeList, {
  domain: "edges",
  scopeKey: ({ caseId }: { readonly caseId: string }) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listEdgesPageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (row: CaseEdgeRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

/**
 * One Connection by id, or null when the Case no longer holds it. Disabled without an id: the ego
 * graph reads it only when a drawn Connection is not on a loaded page of the list.
 */
export const edgeByIdQuery = (caseId: string, edgeId: string | null) => {
  const scopedCaseId = scopeCaseId(caseId);
  return queryOptions({
    queryKey: edgesKeys.byId(scopedCaseId, edgeId ?? ""),
    queryFn: async () => {
      if (edgeId === null) return null;
      const [row] = await getEdgesFn({
        data: { caseId: scopedCaseId, ids: [edgeId] },
      });
      return row ?? null;
    },
    enabled: edgeId !== null && scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};

/**
 * The Dossier ego graph's capped read (#585): the Entity's most recently updated Connections,
 * cut on the server (`isTruncated`). One request, whatever the Entity's degree.
 */
export const graphEgoQuery = (caseId: string, entityId: string) => {
  const scoped = scopeEntityScope(caseId, entityId);
  const queryKey = edgesKeys.graphEgo(scoped.caseId, scoped.entityId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getGraphEgoFn({
        data: parseEntityScopeInput(scoped.caseId, scoped.entityId),
      }),
    enabled: scopeEntityScopeEnabled(caseId, entityId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/**
 * The Graph page's capped snapshot (#570): the Case's most connected Entities and the Connections
 * between them, cut on the server (`isTruncated`). One request, whatever the Case's size.
 */
export const graphSnapshotQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = edgesKeys.graphSnapshot(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getGraphSnapshotFn({ data: parseCaseScopeInput(scopedCaseId) }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
