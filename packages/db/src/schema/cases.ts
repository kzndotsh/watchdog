import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";

/** Case — work scope. Each Entity belongs to exactly one Case. */
export const cases = pgTable(
  "cases",
  {
    id: uuid("id").$type<CaseId>().primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    /**
     * Better Auth organization id (soft text ref, same pattern as
     * `credentials.user_id`). No cross-schema FK.
     */
    organizationId: text("organization_id").$type<OrganizationId>().notNull(),
    /**
     * When false (default), Caps with `egress: "third_party"` refuse to run.
     * Enable to allow AI/paid API Caps to send Case data off-box.
     */
    allowThirdPartyEgress: boolean("allow_third_party_egress")
      .notNull()
      .default(false),
    /**
     * Tombstone (#304). A deleted Case keeps its row, Graph, Evidence and files until it is
     * restored or purged; every read goes through `visibleCase` (`repos/_visible-case.ts`) and
     * skips it. NULL is a live Case. `deleted_by` is the user id (an API key's user), NULL when
     * unknown. The database refuses to change these columns, or to delete a Case, without the
     * matching `case_deletion_records` row in the same transaction (`cases_lifecycle_guard`).
     */
    deletedAt: timestamptz("deleted_at"),
    deletedBy: text("deleted_by"),
    /**
     * Set when a purge begins (the files are about to go). A Case past this point can no longer
     * be restored: its files may already be partly erased. `purge_error` is the last failed
     * attempt's message (log-safe, bounded); the scheduled purge retries until it succeeds.
     */
    purgeStartedAt: timestamptz("purge_started_at"),
    purgeError: text("purge_error"),
    /**
     * When the scheduled purge takes the Case: the delete time plus the restore window of the
     * process that deleted it, fixed at delete time (changing `WD_CASE_RETENTION_DAYS` only
     * affects Cases deleted afterwards). Restore is refused from this instant.
     */
    purgeAfter: timestamptz("purge_after"),
    ...timestamps,
  },
  // Slugs are unique per organization (two organizations may both have "acme") among visible
  // Cases: a deleted Case does not hold its slug (a restore finds another if it was taken).
  (t) => [
    uniqueIndex("cases_organization_id_slug_uidx")
      .on(t.organizationId, t.slug)
      .where(sql`${t.deletedAt} IS NULL`),
    // The purge scan and the Deleted Cases list read only tombstones.
    index("cases_deleted_at_idx")
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} IS NOT NULL`),
  ]
);
