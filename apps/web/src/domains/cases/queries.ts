import { queryOptions } from "@tanstack/react-query";

import {
  getCaseByIdFn,
  getCaseBySlugFn,
  getCasesContextFn,
} from "@/domains/cases/cases.functions";
import {
  parseCaseByIdInput,
  parseCaseBySlugInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeCaseSlugSegment,
  scopeCaseSlugSegmentEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export const casesKeys = {
  all: ["cases"] as const,
  context: () => ["cases", "context"] as const,
  detail: (caseId: string) => ["cases", "detail", caseId] as const,
  bySlug: (caseSlug: string) => ["cases", "bySlug", caseSlug] as const,
};

export const casesContextQuery = () => {
  const queryKey = casesKeys.context();
  return queryOptions({
    queryKey,
    queryFn: async () => getCasesContextFn(),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const caseByIdQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = casesKeys.detail(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getCaseByIdFn({ data: parseCaseByIdInput(scopedCaseId) }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const caseBySlugQuery = (caseSlug: string) => {
  const scopedSlug = scopeCaseSlugSegment(caseSlug);
  const queryKey = casesKeys.bySlug(scopedSlug);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getCaseBySlugFn({ data: parseCaseBySlugInput(scopedSlug) }),
    enabled: scopeCaseSlugSegmentEnabled(caseSlug),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
