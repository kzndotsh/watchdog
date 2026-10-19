import { asc, count, eq } from "drizzle-orm";

import type {
  CaseDeletionEvent,
  CaseId,
  OrganizationId,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { activity } from "../schema/activity";
import { capCache } from "../schema/cap-cache";
import {
  caseDeletionRecords,
  type CasePurgeCounts,
} from "../schema/case-deletion-records";
import { claims } from "../schema/claims";
import { edges } from "../schema/edges";
import { entities } from "../schema/entities";
import { events } from "../schema/events";
import { evidence } from "../schema/evidence";
import { findingSuppressions } from "../schema/finding-suppressions";
import { graphHistory } from "../schema/graph-history";
import { graphWrites } from "../schema/graph-writes";
import { identifiers } from "../schema/identifiers";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { proposals } from "../schema/proposals";
import { questions } from "../schema/questions";
import { tasks } from "../schema/tasks";
import { trimCaseId } from "./_scoped-ids";

export type CaseDeletionRecordRow = typeof caseDeletionRecords.$inferSelect;

export type NewCaseDeletionRecord = {
  caseId: CaseId;
  organizationId: OrganizationId;
  caseName: string;
  caseSlug: string;
  event: CaseDeletionEvent;
  /** The user id, or null for the scheduled purge. */
  actorId: string | null;
  /** An API key's `api-key:...` snapshot, or `system`. */
  actorLabel: string | null;
  /** Only a `purged` row carries what the purge erased. */
  counts?: CasePurgeCounts | null;
};

/** What a purge erases, by name: the table and the column that holds the Case id. */
const COUNTED = [
  ["entities", entities, entities.caseId],
  ["edges", edges, edges.caseId],
  ["claims", claims, claims.caseId],
  ["identifiers", identifiers, identifiers.caseId],
  ["events", events, events.caseId],
  ["questions", questions, questions.caseId],
  ["tasks", tasks, tasks.caseId],
  ["evidence", evidence, evidence.caseId],
  ["proposals", proposals, proposals.caseId],
  ["jobs", jobs, jobs.caseId],
  ["playbookRuns", playbookRuns, playbookRuns.caseId],
  ["graphWrites", graphWrites, graphWrites.caseId],
  ["graphHistory", graphHistory, graphHistory.caseId],
  ["activity", activity, activity.caseId],
  ["capCache", capCache, capCache.caseId],
  ["findingSuppressions", findingSuppressions, findingSuppressions.caseId],
] as const;

/**
 * The permanent deletion record (#304). Append-only by privilege: the application role holds
 * INSERT and SELECT on the table, never UPDATE or DELETE (`AUDIT_TABLES`), so this repo has no
 * method that changes a row.
 */
export const caseDeletionRecordsRepo = {
  async append(
    exec: DbExec,
    values: NewCaseDeletionRecord
  ): Promise<CaseDeletionRecordRow | null> {
    const [row] = await exec
      .insert(caseDeletionRecords)
      .values({ ...values, counts: values.counts ?? null })
      .returning();
    return row ?? null;
  },

  /** A Case's records, oldest first. */
  async listForCase(
    exec: DbExec,
    caseId: CaseId
  ): Promise<CaseDeletionRecordRow[]> {
    const scopedId = trimCaseId(caseId);
    if (scopedId === undefined) return [];
    return exec
      .select()
      .from(caseDeletionRecords)
      .where(eq(caseDeletionRecords.caseId, scopedId))
      .orderBy(asc(caseDeletionRecords.id));
  },

  /**
   * Row counts of everything a purge of this Case removes (the Case's own rows, not the link
   * tables, which follow their parents), for the `purged` record. Read inside the purge
   * transaction, under the Case row lock, so the numbers match what the cascade then deletes.
   */
  async countPurgeContent(
    exec: DbExec,
    caseId: CaseId
  ): Promise<CasePurgeCounts> {
    const scopedId = trimCaseId(caseId);
    if (scopedId === undefined) return {};
    const counts: CasePurgeCounts = {};
    for (const [name, table, column] of COUNTED) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one statement per table, in order, on the purge transaction
      const [row] = await exec
        .select({ n: count() })
        .from(table)
        .where(eq(column, scopedId));
      counts[name] = row?.n ?? 0;
    }
    return counts;
  },
};
