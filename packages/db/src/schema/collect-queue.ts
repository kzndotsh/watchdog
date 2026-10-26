import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import {
  COLLECT_ROW_KINDS,
  COLLECT_ROW_STATES,
} from "@watchdog/schemas/shared";
import type {
  CaseId,
  CollectRowKind,
  CollectRowState,
} from "@watchdog/schemas/shared";

import { timestamptz, xid8 } from "./_helpers";
import { vocabCheck } from "./_vocab";

/*
 * Collect's queue (#574) as a projection of `evidence`, `jobs`, `job_evidence` and
 * `playbook_runs`: one row per slot of the partition the queue builder makes of a Case. Derived
 * data, written only by the database: row triggers on the source tables record the changed keys,
 * and one deferred flush per transaction recomputes the touched rows (`collect_queue_flush`,
 * migration `collect_queue_logic`). The application role may only read it (`app-role.ts`).
 *
 * No foreign keys, on purpose: a foreign key check takes `KEY SHARE` on the parent, and the flush
 * runs at commit while the writer holds row locks of its own, so a key into `jobs` or `cases`
 * could deadlock against `settleJobInTx` or `casesRepo.lockById`. A Case purge clears these rows
 * in `evidence_links_before_case_delete`.
 */

/** One queue row: an Evidence row, a playbook run, or a lone Job. */
export const collectQueue = pgTable(
  "collect_queue",
  {
    /** The Evidence id, the playbook run id, or the Job id (they never share a value). */
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    kind: text("kind").$type<CollectRowKind>().notNull(),
    /** When the row started: `captured_at`, `playbook_runs.created_at` or `jobs.created_at`. */
    sortAt: timestamptz("sort_at").notNull(),
    /**
     * Latest activity from stored transition times only (never `updated_at`, never the clock):
     * `captured_at` for an Evidence row; for a run or Job row, the latest of each member's
     * created, started and finished times and the hide time of Evidence it was linked to.
     */
    activityAt: timestamptz("activity_at").notNull(),
    state: text("state").$type<CollectRowState>().notNull(),
    /** Generated, so the list's btrees can lead with an equality on it (no partial index). */
    hidden: boolean("hidden")
      .generatedAlwaysAs(sql`"state" = 'hidden'`)
      .notNull(),
    /** The Evidence row's Entity; null for a run or Job row. */
    entityId: uuid("entity_id"),
    /** The members' Cap ids and their runs' playbook ids, sorted, without duplicates. */
    capabilityIds: text("capability_ids").array().notNull(),
    /** What `q` matches, built in a fixed order and cut at 4,000 characters. */
    searchText: text("search_text").notNull(),
  },
  (t) => [
    index("collect_queue_activity_idx").on(
      t.caseId,
      t.hidden,
      t.activityAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    index("collect_queue_started_idx").on(
      t.caseId,
      t.hidden,
      t.sortAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    index("collect_queue_state_activity_idx").on(
      t.caseId,
      t.state,
      t.activityAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // The Entity filter: only Evidence rows carry an Entity, so the index is partial and small.
    index("collect_queue_entity_activity_idx")
      .on(
        t.caseId,
        t.entityId,
        t.activityAt.desc().nullsFirst(),
        t.id.desc().nullsFirst()
      )
      .where(sql`${t.entityId} is not null`),
    index("collect_queue_search_trgm_idx").using(
      "gin",
      t.searchText.op("gin_trgm_ops")
    ),
    vocabCheck(t.kind, COLLECT_ROW_KINDS),
    vocabCheck(t.state, COLLECT_ROW_STATES),
  ]
);

/** Which Jobs each queue row holds. A Job is in one or more Evidence rows, or in one run or Job row. */
export const collectQueueMember = pgTable(
  "collect_queue_member",
  {
    jobId: uuid("job_id").notNull(),
    rowId: uuid("row_id").notNull(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.rowId] }),
    index("collect_queue_member_row_idx").on(t.rowId),
    // The drift check counts a Case's member Jobs from this index alone.
    index("collect_queue_member_case_idx").on(t.caseId, t.jobId),
  ]
);

/**
 * One row per transaction that recorded keys (UNLOGGED, set in the migration). Inserting it queues
 * the transaction's single deferred flush; the flush deletes it. The keys themselves live in a
 * temporary table of the session (`pg_temp.collect_queue_keys`).
 */
export const collectQueueTx = pgTable("collect_queue_tx", {
  xid: xid8("xid").primaryKey(),
});

/** Cases whose flush failed (the writer still committed). The reconcile tick rebuilds them. */
export const collectQueueStale = pgTable(
  "collect_queue_stale",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    caseId: uuid("case_id").notNull(),
    at: timestamptz("at").notNull(),
    error: text("error"),
  },
  (t) => [index("collect_queue_stale_case_idx").on(t.caseId)]
);

/** The drift check's round robin: when each Case was last counted and last fully compared. */
export const collectQueueCase = pgTable("collect_queue_case", {
  caseId: uuid("case_id").primaryKey(),
  checkedAt: timestamptz("checked_at"),
  diffedAt: timestamptz("diffed_at"),
});
