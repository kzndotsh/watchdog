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
