import { and, eq, getTableColumns } from "drizzle-orm";

import { graphHistoryList } from "@watchdog/schemas/graph";

import { graphHistory } from "../schema/graph-history";
import { defineListRepo } from "./_list-query";

/**
 * One Graph row's history (`graphHistoryList`, ADR-0007), newest first: the table's rows, one
 * each. Read side only: the table is written by the Graph triggers (`0001_database_logic`) and
 * the app role has no INSERT on it. The sort key is the history id itself, a bigint the driver
 * reads as text, so `listKey` is read back as a number (an id stays under 2^53). The scope is
 * three equalities, so one index serves the page in both directions:
 * `graph_history_case_row_idx (case_id, kind, row_id, id desc)`.
 */
export const graphHistoryListRepo = defineListRepo(graphHistoryList, {
  table: graphHistory,
  base: (exec, listKey) =>
    exec
      .select({
        ...getTableColumns(graphHistory),
        listKey: listKey.mapWith(Number),
      })
      .from(graphHistory)
      .$dynamic(),
  id: graphHistory.id,
  scopeColumn: graphHistory.caseId,
  sortLeads: [graphHistory.kind, graphHistory.rowId],
  scope: ({ caseId, kind, rowId }) =>
    and(
      eq(graphHistory.caseId, caseId),
      eq(graphHistory.kind, kind),
      eq(graphHistory.rowId, rowId)
    ) ?? eq(graphHistory.id, -1),
  filters: {},
  sorts: { change: graphHistory.id },
  search: undefined,
});

/** An entry of a row's history: the table's row and its cursor value. */
export type GraphHistoryRow = Awaited<
  ReturnType<typeof graphHistoryListRepo.page>
>[number];
