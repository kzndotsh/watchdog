import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { JOB_START_LIMIT_SCOPES } from "@watchdog/schemas/shared";
import type {
  JobStartLimitScope,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { timestamptz, timestamps } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { apiKey, organization } from "./auth";

/**
 * Operator-set Job start limits that replace the instance defaults (`WD_JOB_START_LIMIT_*`): one
 * row per organization with `key_id` NULL (the organization's limit), one per API key (that key's
 * limit). No row means the instance default. `max_starts` 0 refuses every start. A row goes with
 * its organization or its key (`on delete cascade`).
 */
export const jobStartLimits = pgTable(
  "job_start_limits",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    organizationId: text("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** NULL: the organization's own limit. Else the API key this limit is for. */
    keyId: text("key_id").references(() => apiKey.id, { onDelete: "cascade" }),
    maxStarts: integer("max_starts").notNull(),
    ...timestamps,
  },
  (t) => [
    // At most one organization-level row and one row per key.
    uniqueIndex("job_start_limits_org_uq")
      .on(t.organizationId)
      .where(sql`${t.keyId} IS NULL`),
    uniqueIndex("job_start_limits_key_uq").on(t.keyId),
    index("job_start_limits_organization_id_idx").on(t.organizationId),
    check("job_start_limits_max_starts_range", sql`${t.maxStarts} >= 0`),
  ]
);

/**
 * Job starts taken in a fixed window, one row per (scope, subject, window): `subject_id` is the
 * organization id or the API key id. A start is admitted by one atomic upsert that raises `count`
 * only while it is below the limit (`jobStartCountersRepo.take`), so concurrent starts at the
 * limit cannot both pass. Rows of past windows carry no meaning: a subject's first start of a window deletes its earlier ones.
 * No foreign keys: a counter is a rate fact, not a record.
 */
export const jobStartCounters = pgTable(
  "job_start_counters",
  {
    scope: text("scope").$type<JobStartLimitScope>().notNull(),
    subjectId: text("subject_id").notNull(),
    windowStart: timestamptz("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({
      name: "job_start_counters_pk",
      columns: [t.scope, t.subjectId, t.windowStart],
    }),
    index("job_start_counters_window_start_idx").on(t.windowStart),
    vocabCheck(t.scope, JOB_START_LIMIT_SCOPES),
  ]
);
