import { queryOptions } from "@tanstack/react-query";

import { entitiesKeys } from "@/domains/entities/entities-keys";
import {
  getEntityBySlugFn,
  listEntitiesFn,
} from "@/domains/entities/entities.functions";
import {
  parseCaseIdInput,
  parseCaseSlugInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeCaseSlug,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export { entitiesKeys } from "@/domains/entities/entities-keys";

export const entitiesListQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = entitiesKeys.all(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listEntitiesFn({ data: parseCaseIdInput(scopedCaseId) }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const entityBySlugQuery = (caseId: string, slug: string) => {
  const { scoped, enabled } = scopeCaseSlug(caseId, slug);
  const queryKey = entitiesKeys.detail(scoped.caseId, scoped.slug);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getEntityBySlugFn({
        data: parseCaseSlugInput(scoped.caseId, scoped.slug),
      }),
    enabled,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
