import { eq, inArray } from "drizzle-orm";

import { proposalList } from "@watchdog/schemas/jobs";

import type { DbExec } from "../exec";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { proposals } from "../schema/proposals";
import { proposalEvidenceCount, proposalOpCounts } from "./_evidence-ids";
import { defineListRepo } from "./_list-query";
import type {
  ListBinding,
  ListKeySql,
  ListRow,
  ListSelect,
} from "./_list-query";
import { proposalColumns } from "./proposals.repo";

/**
 * The Proposal list's binding, minus its select: the scope, filters, sorts and search are written
 * once, and each repo adds the columns it reads (`base`). The full list selects the record; the
 * queue selects its slim projection (#580) over the same WHERE, ORDER BY and indexes.
 */
function proposalListBinding<Row extends ListRow>(
  base: (exec: DbExec, listKey: ListKeySql) => ListSelect<Row>
): ListBinding<typeof proposalList, typeof proposals, Row> {
  return {
    table: proposals,
    base,
    id: proposals.id,
    scopeColumn: proposals.caseId,
    scope: ({ caseId }) => eq(proposals.caseId, caseId),
    filters: {
      status: (statuses) =>
        statuses.length > 0
          ? inArray(proposals.status, [...statuses])
          : undefined,
    },
    // `proposals_case_status_created_idx (case_id, status, created_at desc, id desc)`
    selective: { status: proposals.status },
    sorts: { created: proposals.createdAt },
    searchLabels: { status: proposals.status },
    search: {
      summary: proposals.summary,
      rejectReason: proposals.rejectReason,
    },
  };
}

/**
 * The Case's Proposal list (`proposalList`, ADR-0007): `wd proposals list` and the by-id read.
 * Builder API only. Each row carries the Cap and playbook of the Job that proposed it (display
 * joins; neither is sorted or searched).
 */
export const proposalListRepo = defineListRepo(
  proposalList,
  proposalListBinding((exec, listKey) =>
    exec
      .select({
        ...proposalColumns,
        capabilityId: jobs.capabilityId,
        playbookId: playbookRuns.playbookId,
        listKey,
      })
      .from(proposals)
      .leftJoin(jobs, eq(proposals.jobId, jobs.id))
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .$dynamic()
  )
);

/**
 * The same list for the Triage queue, the Dashboard and the Case overview (#580): what a queue row
 * shows (status, summary, Cap or playbook, time, the count of each kind of op and of cited
 * Evidence) and never the patch, so a page stays small however long the patches are.
 */
export const proposalQueueListRepo = defineListRepo(
  proposalList,
  proposalListBinding((exec, listKey) =>
    exec
      .select({
        id: proposals.id,
        status: proposals.status,
        summary: proposals.summary,
        createdAt: proposals.createdAt,
        capabilityId: jobs.capabilityId,
        playbookId: playbookRuns.playbookId,
        opCounts: proposalOpCounts,
        evidenceCount: proposalEvidenceCount,
        listKey,
      })
      .from(proposals)
      .leftJoin(jobs, eq(proposals.jobId, jobs.id))
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .$dynamic()
  )
);

/** A row of the Proposal list: the Proposal, its cited Evidence ids, its Cap and playbook, and its cursor value. */
export type ProposalListRow = Awaited<
  ReturnType<typeof proposalListRepo.page>
>[number];

/** A row of the Proposal queue's page. */
export type ProposalQueueListRow = Awaited<
  ReturnType<typeof proposalQueueListRepo.page>
>[number];
