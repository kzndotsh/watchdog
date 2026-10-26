import { queryOptions } from "@tanstack/react-query";

import {
  getGraphSnapshotFn,
  listEdgesFn,
} from "@/domains/entities/edges/edges.functions";
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

export const edgesKeys = {
  prefix: (caseId: string) => ["edges", caseId] as const,
  all: (caseId: string, entityId: string) =>
    ["edges", caseId, entityId] as const,
  /** The Graph page's snapshot: under the Case prefix, so every Entity and Connection change refreshes it. */
  graphSnapshot: (caseId: string) =>
    ["edges", caseId, "graph-snapshot"] as const,
};

export const edgesListQuery = (caseId: string, entityId: string) => {
  const scoped = scopeEntityScope(caseId, entityId);
  const queryKey = edgesKeys.all(scoped.caseId, scoped.entityId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listEdgesFn({
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
