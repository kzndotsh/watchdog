import { queryOptions } from "@tanstack/react-query";

import { listEventsFn } from "@/domains/entities/events/events.functions";
import {
  parseEntityScopeInput,
  scopeEntityScope,
  scopeEntityScopeEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export const eventsKeys = {
  prefix: (caseId: string) => ["events", caseId] as const,
  all: (caseId: string, entityId: string) =>
    ["events", caseId, entityId] as const,
};

export const eventsListQuery = (caseId: string, entityId: string) => {
  const scoped = scopeEntityScope(caseId, entityId);
  const queryKey = eventsKeys.all(scoped.caseId, scoped.entityId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listEventsFn({
        data: parseEntityScopeInput(scoped.caseId, scoped.entityId),
      }),
    enabled: scopeEntityScopeEnabled(caseId, entityId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
