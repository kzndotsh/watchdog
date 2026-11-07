import { queryOptions } from "@tanstack/react-query";

import {
  graphRowAttributionFn,
  listGraphHistoryFn,
} from "@/domains/entities/history/history.functions";
import { listView } from "@/shared/lib/list/list-view";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import {
  graphHistoryList,
  type GraphHistoryEntry,
} from "@watchdog/schemas/graph";
import type { GraphHistoryKind } from "@watchdog/schemas/shared";

/** Entries per page in the Dossier's history popover (the API caps a page at 100). */
const HISTORY_PAGE_SIZE = 8;

export const historyKeys = {
  all: (caseId: string) => ["graph-history", caseId] as const,
  row: (caseId: string, kind: GraphHistoryKind, rowId: string) =>
    ["graph-history", caseId, kind, rowId] as const,
  attribution: (caseId: string, kind: GraphHistoryKind, rowId: string) =>
    ["graph-history", caseId, kind, rowId, "attribution"] as const,
};

/** The row a history is read for. */
export type GraphHistoryScope = {
  readonly caseId: string;
  readonly kind: GraphHistoryKind;
  readonly rowId: string;
};

/**
 * One Graph row's history (`graphHistoryList`, ADR-0007), newest first, a page per fetch. Keys sit
 * under `historyKeys.row`, so the contracts that soft-invalidate `historyKeys.all(caseId)` refresh
 * every open history. The popover has always paged to the end, so no page ceiling.
 */
export const graphHistoryListView = listView(graphHistoryList, {
  domain: "graph-history",
  scopeKey: (scope: GraphHistoryScope) => [
    scope.caseId,
    scope.kind,
    scope.rowId,
  ],
  fetchPage: async ({ scope, params, cursor }) =>
    listGraphHistoryFn({
      data: {
        ...scope,
        ...params,
        limit: HISTORY_PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (entry: GraphHistoryEntry) => String(entry.id),
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
  maxPages: Number.POSITIVE_INFINITY,
});

/** Who created and last changed a row as it stands now. Enable it only when the history is opened. */
export const graphRowAttributionQuery = (scope: GraphHistoryScope) =>
  queryOptions({
    queryKey: historyKeys.attribution(scope.caseId, scope.kind, scope.rowId),
    queryFn: async () => graphRowAttributionFn({ data: scope }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
