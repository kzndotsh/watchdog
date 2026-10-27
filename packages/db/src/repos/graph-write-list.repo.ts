import { eq, getTableColumns, inArray } from "drizzle-orm";

import { graphWriteList } from "@watchdog/schemas/graph";

import { graphWrites } from "../schema/graph-writes";
import { defineListRepo } from "./_list-query";

/**
 * The Case's Graph write log (`graphWriteList`, ADR-0007): the audit rows of the writes an agent
 * or the CLI made through `userOverride`, one row each, patch included (the wire item leaves it
 * out; the row is the table's).
 */
export const graphWriteListRepo = defineListRepo(graphWriteList, {
  table: graphWrites,
  base: (exec, listKey) =>
    exec
      .select({ ...getTableColumns(graphWrites), listKey })
      .from(graphWrites)
      .$dynamic(),
  id: graphWrites.id,
  scopeColumn: graphWrites.caseId,
  scope: ({ caseId }) => eq(graphWrites.caseId, caseId),
  filters: {
    confidence: (tiers) =>
      tiers.length > 0
        ? inArray(graphWrites.confidence, [...tiers])
        : undefined,
    actor: (ids) =>
      ids.length > 0 ? inArray(graphWrites.actorId, [...ids]) : undefined,
  },
  // `graph_writes_case_created_idx (case_id, created_at desc, id desc)`
  sorts: { created: graphWrites.createdAt },
  searchLabels: { confidence: graphWrites.confidence },
  search: {
    summary: graphWrites.summary,
    actorLabel: graphWrites.actorLabel,
  },
});

/** A row of the Graph write list: the write and its cursor value. */
export type GraphWriteListRow = Awaited<
  ReturnType<typeof graphWriteListRepo.page>
>[number];
