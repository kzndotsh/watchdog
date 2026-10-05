import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import type { PatchOp } from "@watchdog/schemas/graph";
import type { ProposalStatus, CaseId } from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
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
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    status: text("status").$type<ProposalStatus>().notNull().default("pending"),
    patch: jsonb("patch").$type<PatchOp[]>().notNull(),
    summary: text("summary"),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    rejectReason: text("reject_reason"),
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
    /**
     * Deprecated as override vehicle — agent Graph writes audit via `graph_writes`.
     * Never set true on new paths; column retained for existing rows.
     */
    userOverridden: boolean("user_overridden").notNull().default(false),
    /** Actor who created the Proposal (agent propose / future paths). Cap Jobs leave null. */
    createdBy: text("created_by"),
    ...timestamps,
  },
  (t) => [index("proposals_case_id_idx").on(t.caseId)]
);
