import { queryOptions } from "@tanstack/react-query";

import { listClaimsFn } from "@/domains/entities/claims/claims.functions";
import { listClaimsInputSchema } from "@/domains/entities/claims/types";
import {
  scopeEntityScope,
  scopeEntityScopeEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export const claimsKeys = {
  prefix: (caseId: string) => ["claims", caseId] as const,
  all: (caseId: string, entityId: string) =>
    ["claims", caseId, entityId] as const,
};

export const claimsListQuery = (caseId: string, entityId: string) => {
  const scoped = scopeEntityScope(caseId, entityId);
  const queryKey = claimsKeys.all(scoped.caseId, scoped.entityId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listClaimsFn({
        data: listClaimsInputSchema.parse({
          caseId: scoped.caseId,
          entityId: scoped.entityId,
          includeRetracted: true,
        }),
      }),
    enabled: scopeEntityScopeEnabled(caseId, entityId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
