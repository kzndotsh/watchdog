import { queryOptions } from "@tanstack/react-query";

import { listQuestionsFn } from "@/domains/entities/questions/questions.functions";
import {
  parseEntityScopeInput,
  scopeEntityScope,
  scopeEntityScopeEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export const questionsKeys = {
  prefix: (caseId: string) => ["questions", caseId] as const,
  all: (caseId: string, entityId: string) =>
    ["questions", caseId, entityId] as const,
};

export const questionsListQuery = (caseId: string, entityId: string) => {
  const scoped = scopeEntityScope(caseId, entityId);
  const queryKey = questionsKeys.all(scoped.caseId, scoped.entityId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listQuestionsFn({
        data: parseEntityScopeInput(scoped.caseId, scoped.entityId),
      }),
    enabled: scopeEntityScopeEnabled(caseId, entityId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
