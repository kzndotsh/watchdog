import { index, primaryKey, pgTable, uuid } from "drizzle-orm/pg-core";

import { claims } from "./claims";
import { edges } from "./edges";
import { evidence } from "./evidence";
import { identifiers } from "./identifiers";

/** Claim ↔ Evidence (many-to-many). */
export const claimEvidence = pgTable(
  "claim_evidence",
  {
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.claimId, t.evidenceId] }),
    index("claim_evidence_evidence_id_idx").on(t.evidenceId),
  ]
);

/** Identifier ↔ Evidence. */
export const identifierEvidence = pgTable(
  "identifier_evidence",
  {
    identifierId: uuid("identifier_id")
      .notNull()
      .references(() => identifiers.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.identifierId, t.evidenceId] }),
    index("identifier_evidence_evidence_id_idx").on(t.evidenceId),
  ]
);

/** Edge ↔ Evidence. */
export const edgeEvidence = pgTable(
  "edge_evidence",
  {
    edgeId: uuid("edge_id")
      .notNull()
      .references(() => edges.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.edgeId, t.evidenceId] }),
    index("edge_evidence_evidence_id_idx").on(t.evidenceId),
  ]
);
