import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { EvidenceKind } from "@watchdog/schemas";

import { timestamps, timestamptz } from "./_helpers";
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
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** Optional Case Entity; null = unattached. */
    entityId: uuid("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<EvidenceKind>().notNull(),
    label: text("label"),
    notes: text("notes"),
    mime: text("mime"),
    /** MinIO object key (or future URI). Required for file / url_archive. */
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
  (t) => [index("evidence_case_id_idx").on(t.caseId)]
);
