import type { z } from "zod";

import { PROPOSAL_STATUS_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { defineList } from "./lists/define-list";
import { choices } from "./lists/filter-kinds";
import { trimmedUuidSchema } from "./primitives";
import { PROPOSAL_STATUSES } from "./vocab";

/**
 * The Case's Proposal list (ADR-0007): the Triage queue and `wd proposals list`. `status` has no
 * default: absent is every status, and the Triage nav link carries `?status=["pending"]`. The
 * queue is newest first; search covers the Proposal's own text (its summary and a rejection's
 * reason) plus the Status labels. The Cap, the playbook and the cited Entities are joined
 * columns, so they are not searched here (the command palette still finds a pending Proposal
 * by them).
 */
export const proposalList = defineList({
  name: "proposals",
  noun: { one: "proposal", many: "proposals" },
  scope: caseScopeInputSchema,
  filters: {
    status: choices("Status", PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS),
  },
  sorts: {
    created: { label: "Created", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "created.desc",
  search: {
    fields: ["summary", "rejectReason"],
    hint: "summary or reject reason",
  },
});

/** `proposals.get`: one Proposal of the Case (a URL-selected row the queue has not loaded). */
export const getProposalInputSchema = caseScopeInputSchema.extend({
  proposalId: trimmedUuidSchema,
});

export type GetProposalInput = z.output<typeof getProposalInputSchema>;
