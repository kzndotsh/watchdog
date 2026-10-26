import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { DEFAULT_ALLOWED_EGRESS } from "@watchdog/schemas/caps";
import {
  EGRESS_CLASSES,
  type CaseId,
  type EgressClass,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
import { sqlLiteral } from "./_vocab";

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
     * The egress classes this Case allows. A Job whose Cap derives a class outside the set is
     * blocked before it runs (`local` is always in the set: a Case cannot forbid work that stays
     * on the install). New Cases allow the default: `local` and `target`.
     */
    allowedEgress: text("allowed_egress")
      .array()
      .$type<EgressClass[]>()
      .notNull()
      .default([...DEFAULT_ALLOWED_EGRESS]),
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
    // An array column is not a scalar vocabulary column (`vocabCheck`), so its two rules are
    // spelled out: every element is an egress class, and `local` is always one of them.
    check(
      "cases_allowed_egress_classes",
      sql`${t.allowedEgress} <@ ARRAY[${sql.raw(EGRESS_CLASSES.map(sqlLiteral).join(", "))}]::text[]`
    ),
    check("cases_allowed_egress_local", sql`'local' = ANY(${t.allowedEgress})`),
    uniqueIndex("cases_organization_id_slug_uidx")
      .on(t.organizationId, t.slug)
      .where(sql`${t.deletedAt} IS NULL`),
    // The paged Case list: by name, then id, among visible Cases.
    index("cases_organization_name_idx")
      .on(t.organizationId, t.name, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
    // The purge scan reads only tombstones, oldest first.
    index("cases_deleted_at_idx")
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} IS NOT NULL`),
    // The Deleted Cases list (`deletedCaseList`, ADR-0007): each sort is a btree led by the
    // organization over tombstones only. `deleted_at` is nullable in the type, so the list sorts
    // it as coalesce(deleted_at, epoch) and the index holds that expression.
    index("cases_deleted_list_idx")
      .on(
        t.organizationId,
        sql`coalesce(${t.deletedAt}, '1970-01-01T00:00:00.000Z'::timestamptz)`,
        t.id
      )
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index("cases_deleted_name_idx")
      .on(t.organizationId, t.name, t.id)
      .where(sql`${t.deletedAt} IS NOT NULL`),
    // `q` over the Deleted Cases list's search fields (`pg_trgm`, migration 0002), tombstones only.
    index("cases_deleted_name_trgm_idx")
      .using("gin", t.name.op("gin_trgm_ops"))
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index("cases_deleted_slug_trgm_idx")
      .using("gin", t.slug.op("gin_trgm_ops"))
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index("cases_deleted_description_trgm_idx")
      .using("gin", t.description.op("gin_trgm_ops"))
      .where(sql`${t.deletedAt} IS NOT NULL`),
  ]
);
