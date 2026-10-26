import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { EVIDENCE_KINDS } from "@watchdog/schemas/shared";
import type { EvidenceKind, CaseId } from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";
import { entities } from "./entities";

/**
 * Durable Case material. Payload (uri/sha256/text) immutable after create;
 * label/notes may change. Soft-delete via deletedAt — no hard delete.
 */
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** Optional Case Entity (same Case, by the composite foreign key below); null = unattached. */
    entityId: uuid("entity_id"),
    kind: text("kind").$type<EvidenceKind>().notNull(),
    label: text("label"),
    notes: text("notes"),
    mime: text("mime"),
    /** S3 object key (or future URI). Required for file / url_archive. */
    uri: text("uri"),
    /**
     * Content hash. Required for file / url_archive; nullable for attestation
     * (and URL-only metadata dumps).
     */
    sha256: text("sha256"),
    /** Attestation / small note body (not a substitute for hashed file dumps). */
    text: text("text"),
    sourceUrl: text("source_url"),
    actorId: text("actor_id").notNull(),
    actorLabel: text("actor_label"),
    capturedAt: timestamptz("captured_at").notNull().defaultNow(),
    processedAt: timestamptz("processed_at"),
    deletedAt: timestamptz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    // The Evidence list (`evidence-list.repo.ts`, ADR-0007): one btree per declared sort, led by
    // the Case and ending in the id, scanned forwards or backwards for either direction.
    index("evidence_case_captured_idx").on(
      t.caseId,
      t.capturedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // `label` is nullable: the list sorts it as coalesce(label, ''), so the index holds that.
    index("evidence_case_label_idx").on(
      t.caseId,
      sql`coalesce(${t.label}, '')`,
      t.id
    ),
    // The hidden view (`hidden`: soft-deleted rows, a small share of a Case) under the default
    // sort. Partial, so it holds only the hidden rows.
    index("evidence_case_hidden_captured_idx")
      .on(t.caseId, t.capturedAt.desc().nullsFirst(), t.id.desc().nullsFirst())
      .where(sql`${t.deletedAt} is not null`),
    // The selective `entityId` filter (the Dossier tab) under the default sort, and the foreign
    // key's own lookup (it leads with the column).
    index("evidence_entity_captured_idx").on(
      t.entityId,
      t.capturedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // `q`: trigram indexes over the search fields (`pg_trgm`, created by migration 0002). Global,
    // not Case-scoped: see ADR-0007 "Reopen when" for the budget that decides it.
    index("evidence_label_trgm_idx").using("gin", t.label.op("gin_trgm_ops")),
    index("evidence_notes_trgm_idx").using("gin", t.notes.op("gin_trgm_ops")),
    index("evidence_source_url_trgm_idx").using(
      "gin",
      t.sourceUrl.op("gin_trgm_ops")
    ),
    // `ON DELETE SET NULL (entity_id)`: only the Entity column is cleared, never the Case id.
    // HAND EDIT: drizzle cannot spell the column list, so the custom migration (`database_logic`)
    // replaces the generated key with one that has `("entity_id")`. A regeneration that drops it
    // fails `same-case-integrity.int.test.ts` (it reads `confdelsetcols`).
    foreignKey({
      name: "evidence_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("set null"),
    unique("evidence_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.kind, EVIDENCE_KINDS),
  ]
);
