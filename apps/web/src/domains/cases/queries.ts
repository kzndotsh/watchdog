import { queryOptions } from "@tanstack/react-query";

import {
  getCaseByIdFn,
  getCaseBySlugFn,
  getCasesContextFn,
  getDeletedCaseBySlugFn,
  getDeletionPolicyFn,
  listDeletedCasesPageFn,
} from "@/domains/cases/cases.functions";
import type { DeletedCaseRecord } from "@/domains/cases/types";
import { listView } from "@/shared/lib/list/list-view";
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
import { deletedCaseList } from "@watchdog/schemas/cases";

export const casesKeys = {
  all: ["cases"] as const,
  context: () => ["cases", "context"] as const,
  detail: (caseId: string) => ["cases", "detail", caseId] as const,
  bySlug: (caseSlug: string) => ["cases", "bySlug", caseSlug] as const,
  deletedBySlug: (caseSlug: string) =>
    ["cases", "deleted-by-slug", caseSlug] as const,
  /** The policy; with a Case id, also the Jobs a delete of it would cancel. */
  deletionPolicy: (caseId?: string) =>
    caseId === undefined
      ? (["cases", "deletion-policy"] as const)
      : (["cases", "deletion-policy", caseId] as const),
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

/** The Deleted Cases list has no scope: the organization comes from the caller. */
type DeletedCaseListScope = Record<string, never>;

/**
 * The organization's Deleted Cases list (`deletedCaseList`, ADR-0007), a page at a time, for
 * owners and admins. Keys sit under `casesKeys.all`, so every Case change refreshes each view.
 */
export const deletedCaseListView = listView(deletedCaseList, {
  domain: "cases",
  scopeKey: (_scope: DeletedCaseListScope) => [],
  fetchPage: async ({ params, cursor }) =>
    listDeletedCasesPageFn({
      data: { ...params, ...(cursor === undefined ? {} : { cursor }) },
    }),
  getId: (row: DeletedCaseRecord) => row.id,
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
