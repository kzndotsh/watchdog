import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getCaseByIdFn,
  getCaseBySlugFn,
  getCasesContextFn,
  getDeletedCaseBySlugFn,
  getDeletionPolicyFn,
  listDeletedCasesFn,
} from "@/domains/cases/cases.functions";
import type { DeletedCasesPage } from "@/domains/cases/types";
import {
  parseCaseByIdInput,
  parseCaseBySlugInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeCaseSlugSegment,
  scopeCaseSlugSegmentEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import {
  GC_DEFAULT,
  GC_STABLE,
  STALE_DEFAULT,
  STALE_STABLE,
} from "@/shared/lib/query-stale";
import { listDeletedCasesInputSchema } from "@watchdog/schemas/cases";

export const casesKeys = {
  all: ["cases"] as const,
  context: () => ["cases", "context"] as const,
  detail: (caseId: string) => ["cases", "detail", caseId] as const,
  bySlug: (caseSlug: string) => ["cases", "bySlug", caseSlug] as const,
  deleted: () => ["cases", "deleted"] as const,
  deletedBySlug: (caseSlug: string) =>
    ["cases", "deleted-by-slug", caseSlug] as const,
  /** The policy; with a Case id, also the Jobs a delete of it would cancel. */
  deletionPolicy: (caseId?: string) =>
    caseId === undefined
      ? (["cases", "deletion-policy"] as const)
      : (["cases", "deletion-policy", caseId] as const),
};

/** Deleted Cases per page (the API caps a page at 100). */
const DELETED_CASES_PAGE_SIZE = 25;

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

/**
 * The restore window and whether the caller may delete, restore and purge Cases. For one Case it
 * also counts the Jobs a delete would cancel, so it goes stale like the Jobs do.
 */
export const deletionPolicyQuery = (caseId?: string) =>
  queryOptions({
    queryKey: casesKeys.deletionPolicy(caseId),
    queryFn: async () =>
      getDeletionPolicyFn({
        data: caseId === undefined ? {} : { caseId },
      }),
    staleTime: caseId === undefined ? STALE_STABLE : STALE_DEFAULT,
    gcTime: caseId === undefined ? GC_STABLE : GC_DEFAULT,
  });

/** Deleted Cases (owners and admins), newest deletion first, a page per fetch. */
export const deletedCasesQuery = () =>
  infiniteQueryOptions({
    queryKey: casesKeys.deleted(),
    queryFn: async ({ pageParam }): Promise<DeletedCasesPage> =>
      listDeletedCasesFn({
        data: listDeletedCasesInputSchema.parse({
          limit: DELETED_CASES_PAGE_SIZE,
          cursor: pageParam,
        }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });

/** The deleted Case a Case URL names; null for anyone who may not see it. Enable it for owners and admins only. */
export const deletedCaseBySlugQuery = (caseSlug: string) => {
  const scopedSlug = scopeCaseSlugSegment(caseSlug);
  return queryOptions({
    queryKey: casesKeys.deletedBySlug(scopedSlug),
    queryFn: async () =>
      getDeletedCaseBySlugFn({ data: parseCaseBySlugInput(scopedSlug) }),
    enabled: scopeCaseSlugSegmentEnabled(caseSlug),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};
