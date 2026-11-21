import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { PatchOp } from "@watchdog/schemas/graph";
import {
  CONFIDENCE_TIERS,
  GRAPH_HISTORY_CHANNELS,
} from "@watchdog/schemas/shared";
import type {
  CaseId,
  ConfidenceTier,
  GraphHistoryChannel,
} from "@watchdog/schemas/shared";

import { createdAt } from "./_helpers";
import {
  caseOrganizationId,
  organizationIsolation,
} from "./_organization-policy";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";
import { proposals } from "./proposals";

/**
 * Provenance of Graph writes (#724): one row per Graph write transaction and Case, whatever the
 * channel (a Dossier edit, a Triage Accept, an agent graph write, the system). Every
 * `graph_history` row names its changeset, so an auditor follows a row to the Accept (and its
 * Proposal) or the agent request that wrote it. The history context (`setGraphHistoryContext`)
 * inserts it as the first statement of the transaction; a write with no changeset of its Case
 * (the owner role, a seed) gets one from the history trigger, with the settings it finds.
 *
 * An agent graph write (`agent_write`, the old `graph_writes` row) also carries the request's
 * `patch`, the `confidence` it landed at and an idempotency key. Append-only: the app role may
 * INSERT and SELECT (`AUDIT_TABLES`); rows leave only with their Case.
 */
export const changesets = pgTable(
  "changesets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** The Case's organization, for row-level security (#719): `caseOrganizationId`. */
    organizationId: caseOrganizationId(),
    channel: text("channel").$type<GraphHistoryChannel>().notNull(),
    /** The user; null for a system write. */
    actorId: text("actor_id"),
    /** API-key display snapshot (`api-key:...`), as on `graph_history`. */
    actorLabel: text("actor_label"),
    /** The API key (`apikey.id`, no FK) that made the write; null for a session or the system. */
    actorKeyId: text("actor_key_id"),
    /** The Proposal a Triage Accept applied. */
    proposalId: uuid("proposal_id"),
    idempotencyKey: text("idempotency_key"),
    summary: text("summary"),
    /** The tier an agent write lands at (`unverified`); null for the other channels. */
    confidence: text("confidence").$type<ConfidenceTier>(),
    /** The ops an agent write sent; null for the other channels (an Accept's are its Proposal's). */
    patch: jsonb("patch").$type<PatchOp[]>(),
    createdAt,
  },
  (t) => [
    // Organization isolation (row-level security, #719): the copied organization must be the
    // Case's own, and a row is visible and writable in its organization's transactions only.
    foreignKey({
      name: "changesets_case_organization_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [cases.id, cases.organizationId],
    }).onDelete("cascade"),
    organizationIsolation("changesets", t.organizationId),
    // The Case FK check and the agent write list (`graphWriteList`: one channel, newest first).
    index("changesets_case_channel_created_idx").on(
      t.caseId,
      t.channel,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    index("changesets_proposal_idx").on(t.proposalId),
    // `q` over the agent write list's search fields (`pg_trgm`).
    index("changesets_summary_trgm_idx").using(
      "gin",
      t.summary.op("gin_trgm_ops")
    ),
    index("changesets_actor_label_trgm_idx").using(
      "gin",
      t.actorLabel.op("gin_trgm_ops")
    ),
    uniqueIndex("changesets_case_actor_idem_uidx")
      .on(t.caseId, t.actorId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    // `graph_history (changeset_id, case_id)` references it: a history row's changeset is in its Case.
    unique("changesets_id_case_id_uq").on(t.id, t.caseId),
    foreignKey({
      name: "changesets_proposal_id_case_id_fk",
      columns: [t.proposalId, t.caseId],
      foreignColumns: [proposals.id, proposals.caseId],
    }),
    vocabCheck(t.channel, GRAPH_HISTORY_CHANNELS),
    vocabCheck(t.confidence, CONFIDENCE_TIERS),
    check(
      "changesets_agent_write_shape",
      sql`${t.channel} <> 'agent_write' OR (${t.confidence} IS NOT NULL AND ${t.patch} IS NOT NULL)`
    ),
  ]
);
