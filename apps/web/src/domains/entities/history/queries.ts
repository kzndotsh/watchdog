import { infiniteQueryOptions } from "@tanstack/react-query";

import { listGraphHistoryFn } from "@/domains/entities/history/history.functions";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import {
  listGraphHistoryInputSchema,
  type GraphHistoryPage,
} from "@watchdog/schemas/graph";
import type { GraphHistoryKind } from "@watchdog/schemas/shared";

/** Entries per page in the Dossier's history popover (the API caps a page at 100). */
const HISTORY_PAGE_SIZE = 8;

export const historyKeys = {
  prefix: (caseId: string) => ["graph-history", caseId] as const,
  row: (caseId: string, kind: GraphHistoryKind, rowId: string) =>
    ["graph-history", caseId, kind, rowId] as const,
};

/** One Graph row's history, newest first, a page per fetch. Enable it only when the history is opened. */
export const graphHistoryQuery = (
  caseId: string,
  kind: GraphHistoryKind,
  rowId: string
) =>
  infiniteQueryOptions({
    queryKey: historyKeys.row(caseId, kind, rowId),
    queryFn: async ({ pageParam }): Promise<GraphHistoryPage> =>
      listGraphHistoryFn({
        data: listGraphHistoryInputSchema.parse({
          caseId,
          kind,
          rowId,
          limit: HISTORY_PAGE_SIZE,
          cursor: pageParam,
        }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
