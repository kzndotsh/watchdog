import {
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { CaseId } from "@watchdog/schemas/shared";

import { createdAt, timestamptz } from "./_helpers";
import { cases } from "./cases";
import type { JobArtifact } from "./jobs";

/**
 * Cap result cache — keyed by case + capabilityId + input hash.
 * Read-only Caps only (`kind !== "act"`). Points at prior Job artifacts.
 *
 * `cap_version` is deliberately outside the unique key: a row made by another version of the
 * Cap's code is a miss, and the next run overwrites it, so a Case never keeps dead rows for
 * old versions in a table nothing prunes.
 */
export const capCache = pgTable(
  "cap_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    capabilityId: text("capability_id").notNull(),
    inputHash: text("input_hash").notNull(),
    /** The fingerprint of the Cap's code that produced the row (`jobs.cap_version` of its Job). */
    capVersion: text("cap_version").notNull(),
    jobId: uuid("job_id"),
    artifacts: jsonb("artifacts").$type<JobArtifact[]>().notNull(),
    resultSummary: text("result_summary"),
    /** TTL window in ms from createdAt. */
    ttlMs: integer("ttl_ms").notNull(),
    createdAt,
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("cap_cache_case_cap_input_uidx").on(
      t.caseId,
      t.capabilityId,
      t.inputHash
    ),
  ]
);
