import { queryOptions } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc-client";
import { listView } from "@/shared/lib/list/list-view";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import {
  graphHistoryList,
  type GraphHistoryEntry,
} from "@watchdog/domain/schemas/graph";
import type { GraphHistoryKind } from "@watchdog/domain/schemas/shared";

/** Entries per page in the Dossier's history popover (the API caps a page at 100). */
const HISTORY_PAGE_SIZE = 8;

/**
 * History keys are the oRPC procedure keys: `all(caseId)` is `[["history"], { input: { caseId } }]`,
 * every history read of the Case; `row` is every read of one row (its pages and attribution).
 */
export const historyKeys = {
  all: (caseId: string) => orpc.history.key({ input: { caseId } }),
  row: (caseId: string, kind: GraphHistoryKind, rowId: string) =>
    orpc.history.key({ input: { caseId, kind, rowId } }),
  attribution: (caseId: string, kind: GraphHistoryKind, rowId: string) =>
    orpc.history.attribution.queryKey({ input: { caseId, kind, rowId } }),
};

/** The row a history is read for. */
export type GraphHistoryScope = {
  readonly caseId: string;
  readonly kind: GraphHistoryKind;
  readonly rowId: string;
};

/**
 * One Graph row's history (`graphHistoryList`, ADR-0007), newest first, a page per fetch through
 * `history.list`. Keys sit under `historyKeys.row`, so the contracts that soft-invalidate
 * `historyKeys.all(caseId)` refresh every open history. The popover has always paged to the end,
 * so no page ceiling.
 */
export const graphHistoryListView = listView(graphHistoryList, {
  procedure: orpc.history.list,
  scopeInput: (scope: GraphHistoryScope) => ({
    caseId: scope.caseId,
    kind: scope.kind,
    rowId: scope.rowId,
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scope.caseId,
    kind: scope.kind,
    rowId: scope.rowId,
    limit: HISTORY_PAGE_SIZE,
    ...(cursor === undefined ? {} : { cursor }),
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
    queryFn: async () =>
      orpc.history.attribution.call({
        caseId: scope.caseId,
        kind: scope.kind,
        rowId: scope.rowId,
      }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
