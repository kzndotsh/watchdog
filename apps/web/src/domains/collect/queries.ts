import { queryOptions } from "@tanstack/react-query";

import { collectKeys } from "@/domains/collect/collect-keys";
import {
  getCollectItemFn,
  listCollectPageFn,
} from "@/domains/collect/collect.functions";
import { listView } from "@/shared/lib/list/list-view";
import {
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeOptionalUuid,
} from "@/shared/lib/query-ingress";
import { GC_REALTIME, STALE_REALTIME } from "@/shared/lib/query-stale";
import type { CollectQueueItem } from "@watchdog/core/jobs";
import { collectList } from "@watchdog/schemas/jobs";

export type CollectListScope = { readonly caseId: string };

/**
 * Collect's queue (`collectList`, #574, ADR-0007), a page at a time. Each item is the row with
 * its member Jobs, its Evidence and the titles its Job inputs name, read in one statement. Keys
 * sit under `collectKeys.all`, which the Job and Evidence invalidations name, so SSE and
 * mutations refresh every open view (throttled per view).
 */
export const collectListView = listView(collectList, {
  domain: "collect",
  scopeKey: ({ caseId }: CollectListScope) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listCollectPageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (row: CollectQueueItem) => row.id,
  staleTime: STALE_REALTIME,
  gcTime: GC_REALTIME,
});

/**
 * The row an id belongs to (`collect.get`), for a URL selection the loaded pages do not hold;
 * null when the Case has none. `isHidden` is the list's mode: a hidden Evidence id is found only
 * with it set. Never runs without an id.
 */
export const collectItemQuery = (
  caseId: string,
  id: string | null,
  isHidden: boolean
) => {
  const scopedCaseId = scopeCaseId(caseId);
  const scopedId = scopeOptionalUuid(id) ?? "";
  return queryOptions({
    queryKey: collectKeys.item(scopedCaseId, scopedId, isHidden),
    queryFn: async () =>
      getCollectItemFn({
        data: {
          caseId: scopedCaseId,
          id: scopedId,
          ...(isHidden ? { hidden: true as const } : {}),
        },
      }),
    enabled: scopedId !== "" && scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
  });
};
