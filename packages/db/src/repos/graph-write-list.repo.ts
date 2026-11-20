import { and, eq, getTableColumns, inArray } from "drizzle-orm";

import { graphWriteList } from "@watchdog/schemas/graph";

import { changesets } from "../schema/changesets";
import { defineListRepo } from "./_list-query";

/**
 * The Case's Graph write log (`graphWriteList`, ADR-0007): the changesets (#724) of the writes an
 * agent or the CLI made through `userOverride` (channel `agent_write`), one row each, patch
 * included (the wire item leaves it out).
 */
export const graphWriteListRepo = defineListRepo(graphWriteList, {
  table: changesets,
  base: (exec, listKey) =>
    exec
      .select({ ...getTableColumns(changesets), listKey })
      .from(changesets)
      .$dynamic(),
  id: changesets.id,
  scopeColumn: changesets.caseId,
  sortLeads: [changesets.channel],
  scope: ({ caseId }) => {
    const inCase = eq(changesets.caseId, caseId);
    // `and` answers undefined only for no conditions at all.
    return and(inCase, eq(changesets.channel, "agent_write")) ?? inCase;
  },
  filters: {
    confidence: (tiers) =>
      tiers.length > 0 ? inArray(changesets.confidence, [...tiers]) : undefined,
    actor: (ids) =>
      ids.length > 0 ? inArray(changesets.actorId, [...ids]) : undefined,
  },
  // `changesets_case_channel_created_idx (case_id, channel, created_at desc, id desc)`
  sorts: { created: changesets.createdAt },
  searchLabels: { confidence: changesets.confidence },
  search: {
    summary: changesets.summary,
    actorLabel: changesets.actorLabel,
  },
});

/** A row of the Graph write list: the write and its cursor value. */
export type GraphWriteListRow = Awaited<
  ReturnType<typeof graphWriteListRepo.page>
>[number];
