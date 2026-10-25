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
    // Serves the paged list (keyset on the sort key, then id) and the foreign key's own lookup.
    index("evidence_case_captured_idx").on(
      t.caseId,
      t.capturedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    index("evidence_entity_id_idx").on(t.entityId),
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
