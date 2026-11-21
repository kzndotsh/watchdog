import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  CLAIM_CLASSES,
  CONFIDENCE_TIERS,
  RETRACT_KINDS,
} from "@watchdog/schemas/shared";
import type {
  CaseId,
  OrganizationId,
  ClaimClass,
  ConfidenceTier,
  RetractKind,
} from "@watchdog/schemas/shared";

import { attribution, rowVersion, timestamps, timestamptz } from "./_helpers";
import { currentOrganization } from "./_organization-policy";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";
import { entities } from "./entities";

/** Claim — asserted statement on an Entity. Default views hide retracted. */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull(),
    /** The Entity's Case, held so the foreign key below can refuse a cross-Case row. */
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    /**
     * The Case's organization, copied for row-level security (#718): the policy compares a column
     * of the row instead of looking the Case up, which kept the paged Claim list on its index
     * order (measured on the perf seed). Never written by a caller: the BEFORE INSERT trigger
     * `claims_organization_from_case` sets it from the Case (the insert sends NULL), and the
     * composite foreign key below keeps it the Case's own.
     */
    organizationId: text("organization_id")
      .$type<OrganizationId>()
      .notNull()
      // Deliberate: NOT NULL in the table (and drizzle-kit's snapshot), optional in the insert type;
      // Drizzle sends NULL and the BEFORE INSERT trigger fills the Case's organization first.
      .$defaultFn(() => sql`null`),
    class: text("class").$type<ClaimClass>().notNull().default("observation"),
    text: text("text").notNull(),
    confidence: text("confidence").$type<ConfidenceTier>().notNull(),
    retracted: boolean("retracted").notNull().default(false),
    retractKind: text("retract_kind").$type<RetractKind>(),
    retractedReason: text("retracted_reason"),
    retractedBy: text("retracted_by"),
    retractedAt: timestamptz("retracted_at"),
    supersededByClaimId: uuid("superseded_by_claim_id"),
    ...timestamps,
    ...attribution,
    ...rowVersion,
  },
  (t) => [
    // Serves the paged list (keyset on the sort key, then id) and the foreign key's own lookup.
    index("claims_entity_created_idx").on(t.entityId, t.createdAt, t.id),
    // The Claim list (ADR-0007): the Case's Claims by `created`, and `q` over the text (`pg_trgm`).
    index("claims_case_created_idx").on(t.caseId, t.createdAt, t.id),
    // The retracted view (`retracted` filter): index-ordered however few Claims are retracted.
    // Without it the planner reads every Claim of the Case and sorts the matches when they are rare.
    index("claims_case_retracted_created_idx")
      .on(t.caseId, t.createdAt, t.id)
      .where(sql`${t.retracted}`),
    index("claims_text_trgm_idx").using("gin", t.text.op("gin_trgm_ops")),
    foreignKey({
      name: "claims_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
    unique("claims_id_case_id_uq").on(t.id, t.caseId),
    // The copied organization must be the Case's own (as `activity.organization_id`).
    foreignKey({
      name: "claims_case_organization_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [cases.id, cases.organizationId],
    }).onDelete("cascade"),
    vocabCheck(t.class, CLAIM_CLASSES),
    vocabCheck(t.confidence, CONFIDENCE_TIERS),
    vocabCheck(t.retractKind, RETRACT_KINDS),
    // Organization isolation (row-level security, #718): a Claim is visible and writable when its
    // Case's organization (the copy above) is the transaction's.
    pgPolicy("claims_organization_isolation", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`${t.organizationId} = ${currentOrganization}`,
      withCheck: sql`${t.organizationId} = ${currentOrganization}`,
    }),
  ]
);
