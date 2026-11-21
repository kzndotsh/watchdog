import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { PatchOp } from "@watchdog/domain/schemas/graph";
import { PROPOSAL_STATUSES } from "@watchdog/domain/schemas/shared";
import type { ProposalStatus, CaseId } from "@watchdog/domain/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
import {
  caseOrganizationId,
  organizationIsolation,
} from "./_organization-policy";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";
import { jobs } from "./jobs";

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** The Case's organization, for row-level security (#719): `caseOrganizationId`. */
    organizationId: caseOrganizationId(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    status: text("status").$type<ProposalStatus>().notNull().default("pending"),
    patch: jsonb("patch").$type<PatchOp[]>().notNull(),
    summary: text("summary"),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    rejectReason: text("reject_reason"),
    /**
     * A partial Accept's unticked ops: `left` ops were not applied and nothing
     * suppresses them (a later run may propose them again); `rejected` ops were fingerprinted
     * like a Reject. Both empty for a whole Accept, a Reject and a pending Proposal.
     */
    leftOpIds: uuid("left_op_ids").array().notNull().default([]),
    rejectedOpIds: uuid("rejected_op_ids").array().notNull().default([]),
    decidedBy: text("decided_by"),
    decidedAt: timestamptz("decided_at"),
    /** Re-interpret versioning — increments each time interpret reruns on the same Job. */
    version: integer("version").notNull().default(1),
    /** Points to the Proposal this one superseded (re-interpret chain). */
    supersededByProposalId: uuid("superseded_by_proposal_id"),
    /**
     * True when Proposal arrived via agent propose API (not Cap Jobs).
     * Cap Jobs always leave this false.
     */
    agentSourced: boolean("agent_sourced").notNull().default(false),
    /** Actor who created the Proposal (agent propose / future paths). Cap Jobs leave null. */
    createdBy: text("created_by"),
    ...timestamps,
  },
  (t) => [
    // Organization isolation (row-level security, #719): the copied organization must be the
    // Case's own, and a row is visible and writable in its organization's transactions only.
    foreignKey({
      name: "proposals_case_organization_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [cases.id, cases.organizationId],
    }).onDelete("cascade"),
    organizationIsolation("proposals", t.organizationId),
    // Serves the paged list (keyset on the sort key, then id) and the foreign key's own lookup.
    index("proposals_case_created_idx").on(
      t.caseId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // The Proposal list's `status` filter (`proposal-list.repo.ts`, ADR-0007): Triage opens on
    // `status=pending`, a small slice of a Case's Proposals once most are decided.
    index("proposals_case_status_created_idx").on(
      t.caseId,
      t.status,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // `q`: trigram indexes over the Proposal list's search fields (`pg_trgm`, the baseline migration).
    index("proposals_summary_trgm_idx").using(
      "gin",
      t.summary.op("gin_trgm_ops")
    ),
    index("proposals_reject_reason_trgm_idx").using(
      "gin",
      t.rejectReason.op("gin_trgm_ops")
    ),
    index("proposals_job_id_idx").on(t.jobId),
    // The target of the composite foreign key on `proposal_evidence`.
    unique("proposals_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.status, PROPOSAL_STATUSES),
  ]
);
