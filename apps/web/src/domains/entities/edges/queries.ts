import { queryOptions } from "@tanstack/react-query";

import {
  listEdgesFn,
  listEdgesForCaseFn,
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
  forCase: (caseId: string) => ["edges", caseId, "case"] as const,
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

export const edgesForCaseQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = edgesKeys.forCase(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listEdgesForCaseFn({ data: parseCaseScopeInput(scopedCaseId) }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
