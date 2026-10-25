import { and, desc, eq, lt } from "drizzle-orm";

import type { CaseId, GraphHistoryKind } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { graphHistory } from "../schema/graph-history";
import { trimCaseId, trimResourceId } from "./_scoped-ids";

export type GraphHistoryRow = typeof graphHistory.$inferSelect;

export type ListGraphHistoryOpts = {
  caseId: CaseId;
  kind: GraphHistoryKind;
  rowId: string;
  /** Return entries older than this history id (the previous page's last). */
  beforeId?: number;
  limit: number;
};

/**
 * Read side of `graph_history`. There is no writer here on purpose: the table
 * is written only by the Graph triggers (`0001_database_logic`),
 * and the app role has no INSERT on it.
 */
export const graphHistoryRepo = {
  /** One row's history, newest first, one page: `limit` is the caller's page size plus one. */
  async listForRow(
    exec: DbExec,
    opts: ListGraphHistoryOpts
  ): Promise<GraphHistoryRow[]> {
    const caseId = trimCaseId(opts.caseId);
    const rowId = trimResourceId(opts.rowId);
    if (caseId === undefined || rowId === undefined) return [];
    return exec
      .select()
      .from(graphHistory)
      .where(
        and(
          eq(graphHistory.caseId, caseId),
          eq(graphHistory.kind, opts.kind),
          eq(graphHistory.rowId, rowId),
          opts.beforeId === undefined
            ? undefined
            : lt(graphHistory.id, opts.beforeId)
        )
      )
      .orderBy(desc(graphHistory.id))
      .limit(opts.limit);
  },
};
