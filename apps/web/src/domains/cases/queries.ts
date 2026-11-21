import { queryOptions } from "@tanstack/react-query";

import { localDayStartIso } from "@/domains/cases/lib/case-counts";
import type { CaseRecord, DeletedCaseRecord } from "@/domains/cases/types";
import { orpc } from "@/lib/orpc-client";
import { orpcNullIfNotFound } from "@/lib/orpc-null-if-not-found";
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
  GC_REALTIME,
  GC_STABLE,
  STALE_DEFAULT,
  STALE_REALTIME,
  STALE_STABLE,
} from "@/shared/lib/query-stale";
import { deletedCaseList } from "@watchdog/schemas/cases";
import { PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";

/** The switcher, palette, Cases page and first-Case gate read one page of Cases by name. */
const VISIBLE_CASES_INPUT = { limit: PAGE_LIMIT_MAX } as const;

/**
 * Cases keys are the oRPC procedure keys (`[path, { input, type }]`): `all` is every Case read
 * (`[["cases"]]`), `counts()` every Case's tile counts.
 */
export const casesKeys = {
  all: orpc.cases.key(),
  /** The visible Cases (`cases.list`, first page by name). */
  visible: () =>
    orpc.cases.list.key({ type: "query", input: VISIBLE_CASES_INPUT }),
  detail: (caseId: string) =>
    orpc.cases.get.key({ type: "query", input: { caseId } }),
  bySlug: (caseSlug: string) =>
    orpc.cases.getBySlug.key({ type: "query", input: { caseSlug } }),
  deletedBySlug: (caseSlug: string) =>
    orpc.cases.getDeletedBySlug.key({ type: "query", input: { caseSlug } }),
  /** Every Case's tile counts: the prefix a Case-scoped change refreshes. */
  counts: () => orpc.cases.counts.key(),
  /** One Case's tile counts for one calendar day (the day decides which tasks are overdue). */
  casesCounts: (caseId: string, dayStart: string) =>
    orpc.cases.counts.key({ type: "query", input: { caseId, dayStart } }),
  /** The policy; with a Case id, also the Jobs a delete of it would cancel. */
  deletionPolicy: (caseId?: string) =>
    orpc.cases.deletionPolicy.key({
      type: "query",
      input: caseId === undefined ? {} : { caseId },
    }),
};

/**
 * The Cases the caller's organization can see, one page by name (`cases.list`, at most
 * `PAGE_LIMIT_MAX`): the Case switcher, the palette, the Cases page and the first-Case gate.
 * Which one is Active is not server state: the URL's Case, else the last one entered
 * (`lib/active-case.ts`).
 */
export const visibleCasesQuery = () => {
  const queryKey = casesKeys.visible();
  return queryOptions({
    queryKey,
    queryFn: async (): Promise<CaseRecord[]> => {
      const page = await orpc.cases.list.call(VISIBLE_CASES_INPUT);
      return page.items;
    },
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
      orpcNullIfNotFound(orpc.cases.get.call(parseCaseByIdInput(scopedCaseId))),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/**
 * Org-scoped in core: a slug the caller's organization cannot see is not found (null), the same
 * answer as a slug that never existed.
 */
export const caseBySlugQuery = (caseSlug: string) => {
  const scopedSlug = scopeCaseSlugSegment(caseSlug);
  const queryKey = casesKeys.bySlug(scopedSlug);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      orpcNullIfNotFound(
        orpc.cases.getBySlug.call(parseCaseBySlugInput(scopedSlug))
      ),
    enabled: scopeCaseSlugSegmentEnabled(caseSlug),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/**
 * The Case's tile counts (#571): entities, identifiers, connections, Evidence, live Jobs and the
 * overdue and due-soon Tasks, each exact below the list cap and capped above it, in one request.
 * `dayStart` is the browser's calendar day, so "overdue" follows the investigator's clock. They
 * go stale with any change to the Case (the invalidation feed keys include the prefix).
 */
export const caseCountsQuery = (
  caseId: string,
  dayStart = localDayStartIso()
) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = casesKeys.casesCounts(scopedCaseId, dayStart);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      orpc.cases.counts.call({ caseId: scopedCaseId, dayStart }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
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
      orpc.cases.deletionPolicy.call(caseId === undefined ? {} : { caseId }),
    staleTime: caseId === undefined ? STALE_STABLE : STALE_DEFAULT,
    gcTime: caseId === undefined ? GC_STABLE : GC_DEFAULT,
  });

/**
 * The organization's Deleted Cases list (`deletedCaseList`, ADR-0007), a page at a time through
 * `cases.listDeleted`, for owners and admins. The list has no scope: the organization comes from
 * the caller. Keys sit under `casesKeys.all`, so every Case change refreshes each view.
 */
export const deletedCaseListView = listView(deletedCaseList, {
  procedure: orpc.cases.listDeleted,
  scopeInput: (_scope: Record<string, never>) => ({}),
  input: ({ params, cursor }) => ({
    ...params,
    ...(cursor === undefined ? {} : { cursor }),
  }),
  getId: (row: DeletedCaseRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

/**
 * The deleted Case a Case URL names, for owners and admins. Anyone else, and any slug that is
 * not a deleted Case of the caller's organization, is null: the ordinary not-found screen.
 * Enable it for owners and admins only.
 */
export const deletedCaseBySlugQuery = (caseSlug: string) => {
  const scopedSlug = scopeCaseSlugSegment(caseSlug);
  return queryOptions({
    queryKey: casesKeys.deletedBySlug(scopedSlug),
    queryFn: async () =>
      orpcNullIfNotFound(
        orpc.cases.getDeletedBySlug.call(parseCaseBySlugInput(scopedSlug))
      ),
    enabled: scopeCaseSlugSegmentEnabled(caseSlug),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};
