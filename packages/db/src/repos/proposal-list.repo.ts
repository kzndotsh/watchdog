import { eq, inArray } from "drizzle-orm";

import { proposalList } from "@watchdog/schemas/jobs";

import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { proposals } from "../schema/proposals";
import { defineListRepo } from "./_list-query";
import { proposalColumns } from "./proposals.repo";

/**
 * The Case's Proposal list (`proposalList`, ADR-0007): the Triage queue and `wd proposals list`.
 * Builder API only. Each row carries the Cap and playbook of the Job that proposed it (display
 * joins; neither is sorted or searched).
 */
export const proposalListRepo = defineListRepo(proposalList, {
  table: proposals,
  base: (exec, listKey) =>
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
      .$dynamic(),
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
});

/** A row of the Proposal list: the Proposal, its cited Evidence ids, its Cap and playbook, and its cursor value. */
export type ProposalListRow = Awaited<
  ReturnType<typeof proposalListRepo.page>
>[number];
