import { queryOptions } from "@tanstack/react-query";

import {
  listIdentifiersFn,
  listIdentifiersForCaseFn,
} from "@/domains/entities/identifiers/identifiers.functions";
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

export const identifiersKeys = {
  prefix: (caseId: string) => ["identifiers", caseId] as const,
  all: (caseId: string, entityId: string) =>
    ["identifiers", caseId, entityId] as const,
  forCase: (caseId: string) => ["identifiers", caseId, "case"] as const,
};

export const identifiersListQuery = (caseId: string, entityId: string) => {
  const scoped = scopeEntityScope(caseId, entityId);
  const queryKey = identifiersKeys.all(scoped.caseId, scoped.entityId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listIdentifiersFn({
        data: parseEntityScopeInput(scoped.caseId, scoped.entityId),
      }),
    enabled: scopeEntityScopeEnabled(caseId, entityId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const identifiersForCaseQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = identifiersKeys.forCase(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listIdentifiersForCaseFn({ data: parseCaseScopeInput(scopedCaseId) }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
