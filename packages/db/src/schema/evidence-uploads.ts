import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { CaseId } from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
import { cases } from "./cases";

/**
 * A presigned Evidence upload the server handed out (#305): what the browser or CLI declared
 * (hash, type, size) for one object key, and whether the Evidence confirmation has happened.
 * It is how the server knows what is pending: confirmation is refused for a key never presigned
 * or whose declaration differs, and the orphan sweep deletes the object of a row never confirmed
 * within the grace window. The declared values are claims, never the Evidence's: the Evidence
 * row takes the hash the server computed from the stored bytes.
 *
 * One row per `(case_id, uri)`: the key is content-addressed, so a repeat presign of the same
 * file refreshes the row (`created_at` restarts the window, `confirmed_at` clears). Not Graph
 * and not audit: a cascade from the Case removes it with the Case.
 */
export const evidenceUploads = pgTable(
  "evidence_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** The object key (`{caseId}/{sha256}/{name}`). */
    uri: text("uri").notNull(),
    declaredSha256: text("declared_sha256").notNull(),
    declaredMime: text("declared_mime").notNull(),
    declaredByteLength: integer("declared_byte_length").notNull(),
    /** Who asked for the presigned URL (a user id). */
    actorId: text("actor_id").notNull(),
    /**
     * `created_at` is when the URL was issued (a repeat presign of the same key restarts it);
     * `updated_at` is the last change of any kind.
     */
    ...timestamps,
    /** Set in the transaction that records the Evidence; null while pending. */
    confirmedAt: timestamptz("confirmed_at"),
  },
  (t) => [
    // Leads with the Case: serves the foreign key and the per-key lookup.
    unique("evidence_uploads_case_uri_uq").on(t.caseId, t.uri),
    // The sweep reads only unconfirmed rows, oldest first.
    index("evidence_uploads_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.confirmedAt} IS NULL`),
  ]
);
