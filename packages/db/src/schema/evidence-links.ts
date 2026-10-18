import {
  foreignKey,
  index,
  integer,
  primaryKey,
  pgTable,
  uuid,
} from "drizzle-orm/pg-core";

import type { CaseId } from "@watchdog/schemas/shared";

import { claims } from "./claims";
import { edges } from "./edges";
import { evidence } from "./evidence";
import { identifiers } from "./identifiers";
import { jobs } from "./jobs";
import { proposals } from "./proposals";

/*
 * Every link table carries the Case id and two composite foreign keys, `(parent_id, case_id)`
 * and `(evidence_id, case_id)`, each into a `unique (id, case_id)` on its parent. Both ends of a
 * link therefore belong to the link's Case, and Postgres refuses a cross-Case link.
 *
 * Deleting: the Graph link tables (claim, identifier, edge) cascade from both ends. The Proposal and
 * Job links cascade from their parent but RESTRICT from the Evidence end: Evidence is forensic, so
 * a hard delete of Evidence that a Proposal or Job still cites is refused (the app soft-deletes
 * Evidence anyway). A Case delete must still remove everything in it, but Postgres checks RESTRICT
 * (and `no action`) when the cascaded Evidence delete finishes, before the cascade reaches the Job,
 * so a BEFORE DELETE trigger on `cases` (migration `evidence_delete_restrict_trigger`, hand-written
 * SQL: triggers are not in drizzle's snapshot) removes the two link tables' rows of the Case first.
 * That is why both tables index `case_id`.
 */

/** Claim ↔ Evidence (many-to-many). */
export const claimEvidence = pgTable(
  "claim_evidence",
  {
    claimId: uuid("claim_id").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.claimId, t.evidenceId] }),
    index("claim_evidence_evidence_id_idx").on(t.evidenceId),
    foreignKey({
      name: "claim_evidence_claim_id_case_id_fk",
      columns: [t.claimId, t.caseId],
      foreignColumns: [claims.id, claims.caseId],
    }).onDelete("cascade"),
    foreignKey({
      name: "claim_evidence_evidence_id_case_id_fk",
      columns: [t.evidenceId, t.caseId],
      foreignColumns: [evidence.id, evidence.caseId],
    }).onDelete("cascade"),
  ]
);

/** Identifier ↔ Evidence. */
export const identifierEvidence = pgTable(
  "identifier_evidence",
  {
    identifierId: uuid("identifier_id").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.identifierId, t.evidenceId] }),
    index("identifier_evidence_evidence_id_idx").on(t.evidenceId),
    foreignKey({
      name: "identifier_evidence_identifier_id_case_id_fk",
      columns: [t.identifierId, t.caseId],
      foreignColumns: [identifiers.id, identifiers.caseId],
    }).onDelete("cascade"),
    foreignKey({
      name: "identifier_evidence_evidence_id_case_id_fk",
      columns: [t.evidenceId, t.caseId],
      foreignColumns: [evidence.id, evidence.caseId],
    }).onDelete("cascade"),
  ]
);

/** Edge ↔ Evidence. */
export const edgeEvidence = pgTable(
  "edge_evidence",
  {
    edgeId: uuid("edge_id").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.edgeId, t.evidenceId] }),
    index("edge_evidence_evidence_id_idx").on(t.evidenceId),
    foreignKey({
      name: "edge_evidence_edge_id_case_id_fk",
      columns: [t.edgeId, t.caseId],
      foreignColumns: [edges.id, edges.caseId],
    }).onDelete("cascade"),
    foreignKey({
      name: "edge_evidence_evidence_id_case_id_fk",
      columns: [t.evidenceId, t.caseId],
      foreignColumns: [evidence.id, evidence.caseId],
    }).onDelete("cascade"),
  ]
);

/** Proposal ↔ Evidence: the Evidence a Proposal cites, in the order it cited it. */
export const proposalEvidence = pgTable(
  "proposal_evidence",
  {
    proposalId: uuid("proposal_id").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    /** Citation order; the API returns Evidence ids in this order. */
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.proposalId, t.evidenceId] }),
    index("proposal_evidence_evidence_id_idx").on(t.evidenceId),
    index("proposal_evidence_case_id_idx").on(t.caseId),
    foreignKey({
      name: "proposal_evidence_proposal_id_case_id_fk",
      columns: [t.proposalId, t.caseId],
      foreignColumns: [proposals.id, proposals.caseId],
    }).onDelete("cascade"),
    foreignKey({
      name: "proposal_evidence_evidence_id_case_id_fk",
      columns: [t.evidenceId, t.caseId],
      foreignColumns: [evidence.id, evidence.caseId],
    }).onDelete("restrict"),
  ]
);

/** Job ↔ Evidence: the Evidence a Job landed or reused, in landing order. */
export const jobEvidence = pgTable(
  "job_evidence",
  {
    jobId: uuid("job_id").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    /** Landing order; the API returns Evidence ids in this order. */
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.evidenceId] }),
    index("job_evidence_evidence_id_idx").on(t.evidenceId),
    index("job_evidence_case_id_idx").on(t.caseId),
    foreignKey({
      name: "job_evidence_job_id_case_id_fk",
      columns: [t.jobId, t.caseId],
      foreignColumns: [jobs.id, jobs.caseId],
    }).onDelete("cascade"),
    foreignKey({
      name: "job_evidence_evidence_id_case_id_fk",
      columns: [t.evidenceId, t.caseId],
      foreignColumns: [evidence.id, evidence.caseId],
    }).onDelete("restrict"),
  ]
);
