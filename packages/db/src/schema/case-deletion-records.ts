import { bigint, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { CASE_DELETION_EVENTS } from "@watchdog/schemas/shared";
import type {
  CaseDeletionEvent,
  CaseId,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { timestamptz } from "./_helpers";
import { vocabCheck } from "./_vocab";

/** What a purge erased, by kind: the counts a deletion record keeps in place of the content. */
export type CasePurgeCounts = Record<string, number>;

/**
 * Permanent, append-only record that a Case existed and what was done to it (#304): one row per
 * tombstone (`deleted`), restore (`restored`) and purge (`purged`). It has no foreign key to
 * `cases`, so it outlives the purge, and the application role may only INSERT and SELECT it
 * (`AUDIT_TABLES` in `app-role.ts`). The name and slug are the Case's at that moment; a purge row
 * carries `counts` of what went. A NULL actor is the scheduled purge (`system`) or an unknown
 * caller; `actor_label` holds an API key's `api-key:...` snapshot or `system`.
 */
export const caseDeletionRecords = pgTable(
  "case_deletion_records",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    organizationId: text("organization_id").$type<OrganizationId>().notNull(),
    caseName: text("case_name").notNull(),
    caseSlug: text("case_slug").notNull(),
    event: text("event").$type<CaseDeletionEvent>().notNull(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label"),
    counts: jsonb("counts").$type<CasePurgeCounts>(),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("case_deletion_records_case_id_idx").on(t.caseId, t.id),
    index("case_deletion_records_organization_id_idx").on(
      t.organizationId,
      t.id
    ),
    vocabCheck(t.event, CASE_DELETION_EVENTS),
  ]
);
