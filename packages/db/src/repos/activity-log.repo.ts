import { and, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";

import type { ActivityCursor, ActivityEntryKind } from "@watchdog/schemas/feed";
import type { PatchOp } from "@watchdog/schemas/graph";
import {
  normalizeUuidList,
  type CaseId,
  type JsonObject,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { activity } from "../schema/activity";
import { cases } from "../schema/cases";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { proposals } from "../schema/proposals";
import { clampSearchLimit } from "./_limits";
import { orgCaseFilter } from "./_org-case-filter";
import { trimActorId, trimCaseId, trimResourceId } from "./_scoped-ids";

export type ActivityRow = typeof activity.$inferSelect;

export interface NewActivityRow {
  caseId: string;
  kind: ActivityEntryKind;
  action: string;
  subjectId?: string | null;
  groupId?: string | null;
  label?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
}

export interface PruneActivityOpts {
  /** Delete only entries created before this instant. */
  before: Date;
  /** Always keep this many newest entries (by id) of every Case. */
  keepPerCase: number;
  /** Delete at most this many entries. */
  limit: number;
  /** Delete only entries at or below this position (what a durable consumer has read). */
  notPast?: ActivityCursor | null;
}

export interface PruneActivityResult {
  /** Entries deleted by this batch. */
  count: number;
  /** The newest position deleted; `null` when nothing was. */
  newest: ActivityCursor | null;
}

export interface DrainActivityOpts {
  /** Exclusive lower bound. */
  after: ActivityCursor;
  limit: number;
  /** Scope to an organization's Cases (replay); omit for the process-wide tailer. */
  organizationId?: OrganizationId;
  caseId?: string;
}

/** One kind and the actions of it the feed shows (`FEED_ACTIONS` in core). */
export interface FeedFilter {
  kind: ActivityEntryKind;
  actions: readonly string[];
}

export interface RecentFeedOpts {
  organizationId: OrganizationId;
  caseId?: string;
  /** Allowlist of kind and action pairs; an entry outside every filter is never read. */
  filters: readonly FeedFilter[];
  limit: number;
}

export interface RecentActivityLogRow {
  id: number;
  caseId: CaseId;
  caseName: string;
  kind: ActivityEntryKind;
  action: string;
  subjectId: string | null;
  groupId: string | null;
  label: string | null;
  fromValue: string | null;
  toValue: string | null;
  actorId: string | null;
  actorLabel: string | null;
  at: Date;
}

/** What Recent activity needs to label a Proposal entry (Proposal labels are resolved on read). */
export interface ProposalActivityLabelRow {
  id: string;
  caseId: CaseId;
  summary: string | null;
  patch: PatchOp[];
  capabilityId: string | null;
  playbookId: string | null;
}

/** What Recent activity needs to label a Job entry (Job labels are resolved on read). */
export interface JobActivityLabelRow {
  id: string;
  caseId: CaseId;
  capabilityId: string;
  resultSummary: string | null;
  input: JsonObject;
  playbookRunId: string | null;
  playbookStep: number | null;
  playbookFanIndex: number;
  playbookId: string | null;
  updatedAt: Date;
}

/**
 * Rows whose writing transaction is older than every still-running one: no row
 * can ever appear below a cursor that has passed them (ADR-0005 decision 4).
 */
const COMMIT_SAFE = sql`${activity.xid} < pg_snapshot_xmin(pg_current_snapshot())`;

function afterCursor(after: ActivityCursor) {
  return sql`(${activity.xid}, ${activity.id}) > (${after.xid}::xid8, ${after.id})`;
}

function cursorOf(row: { xid: string; id: number } | undefined) {
  return row === undefined ? null : { xid: row.xid, id: row.id };
}

export const activityLogRepo = {
  /**
   * The only writer of the log. Call it on the domain transaction's `tx`: a
   * rollback then removes the row, and the trigger's NOTIFY with it.
   */
  async append(
    exec: DbExec,
    values: NewActivityRow
  ): Promise<ActivityRow | null> {
    const caseId = trimCaseId(values.caseId);
    if (caseId === undefined) return null;
    const subjectId =
      values.subjectId === undefined || values.subjectId === null
        ? null
        : (trimResourceId(values.subjectId) ?? undefined);
    const groupId =
      values.groupId === undefined || values.groupId === null
        ? null
        : (trimResourceId(values.groupId) ?? undefined);
    if (subjectId === undefined || groupId === undefined) return null;
    const actorId =
      values.actorId === undefined || values.actorId === null
        ? null
        : (trimActorId(values.actorId) ?? null);
    const [created] = await exec
      .insert(activity)
      .values({
        caseId,
        kind: values.kind,
        action: values.action,
        subjectId,
        groupId,
        label: values.label ?? null,
        actorId,
        actorLabel: values.actorLabel ?? null,
        fromValue: values.fromValue ?? null,
        toValue: values.toValue ?? null,
      })
      .returning();
    return created ?? null;
  },

  /**
   * Commit-safe read in `(xid, id)` order, strictly after `after`. A row of a
   * transaction that is still open is not returned until it commits or aborts.
   */
  async drain(exec: DbExec, opts: DrainActivityOpts): Promise<ActivityRow[]> {
    const limit = Math.max(1, Math.trunc(opts.limit));
    const where = and(afterCursor(opts.after), COMMIT_SAFE);
    const order = [activity.xid, activity.id] as const;
    if (opts.organizationId === undefined) {
      return exec
        .select(getTableColumns(activity))
        .from(activity)
        .where(where)
        .orderBy(...order)
        .limit(limit);
    }
    return exec
      .select(getTableColumns(activity))
      .from(activity)
      .innerJoin(cases, eq(cases.id, activity.caseId))
      .where(
        and(
          where,
          orgCaseFilter(opts.organizationId, opts.caseId, activity.caseId)
        )
      )
      .orderBy(...order)
      .limit(limit);
  },

  /** True when any row, committed or not, sits past `after` (the tailer re-polls while it does). */
  async hasPast(exec: DbExec, after: ActivityCursor): Promise<boolean> {
    const [row] = await exec
      .select({ id: activity.id })
      .from(activity)
      .where(afterCursor(after))
      .limit(1);
    return row !== undefined;
  },

  /** The newest commit-safe position; `(0, 0)` when nothing is readable yet. */
  async head(exec: DbExec): Promise<ActivityCursor> {
    const [row] = await exec
      .select({ xid: activity.xid, id: activity.id })
      .from(activity)
      .where(COMMIT_SAFE)
      .orderBy(desc(activity.xid), desc(activity.id))
      .limit(1);
    return cursorOf(row) ?? { xid: "0", id: 0 };
  },

  /** The newest position of any row (safe or not); `null` for an empty log. */
  async newest(exec: DbExec): Promise<ActivityCursor | null> {
    const [row] = await exec
      .select({ xid: activity.xid, id: activity.id })
      .from(activity)
      .orderBy(desc(activity.xid), desc(activity.id))
      .limit(1);
    return cursorOf(row);
  },

  /**
   * Delete one batch of old entries, oldest position first (ADR-0005 decision
   * 8): created before `before`, outside the newest `keepPerCase` entries of
   * their Case, and not past `notPast`. The caller runs it in the same
   * transaction that raises the replay floor to `newest`.
   */
  async pruneBatch(
    exec: DbExec,
    opts: PruneActivityOpts
  ): Promise<PruneActivityResult> {
    const keep = Math.max(0, Math.trunc(opts.keepPerCase));
    const limit = Math.max(1, Math.trunc(opts.limit));
    const bound = opts.notPast ?? null;
    // `keep_from` is the id of the keep-th newest entry of the Case (0 when the
    // Case has fewer): only entries below it are beyond the kept tail.
    const keepFrom =
      keep === 0
        ? sql`9223372036854775807`
        : sql`COALESCE((SELECT k.id FROM activity k WHERE k.case_id = a.case_id ORDER BY k.id DESC OFFSET ${keep - 1} LIMIT 1), 0)`;
    const readByConsumers =
      bound === null
        ? sql`TRUE`
        : sql`(a.xid, a.id) <= (${bound.xid}::xid8, ${bound.id})`;
    const rows = await exec.execute<{
      n: string;
      xid: string;
      id: string;
    }>(sql`
      WITH candidates AS (
        SELECT a.id FROM activity a
        WHERE a.created_at < ${opts.before.toISOString()}::timestamptz
          AND a.id < ${keepFrom}
          AND ${readByConsumers}
        ORDER BY a.xid, a.id
        LIMIT ${limit}
      ), gone AS (
        DELETE FROM activity d USING candidates c
        WHERE d.id = c.id
        RETURNING d.xid, d.id
      )
      SELECT (SELECT count(*) FROM gone)::text AS n, newest.xid::text AS xid, newest.id::text AS id
      FROM (SELECT xid, id FROM gone ORDER BY xid DESC, id DESC LIMIT 1) newest
    `);
    const [row] = rows;
    if (row === undefined) return { count: 0, newest: null };
    return {
      count: Number(row.n),
      newest: { xid: row.xid, id: Number(row.id) },
    };
  },

  /**
   * True when a row carries an `xid` this cluster has not handed out yet: only
   * a log restored from another cluster can (ADR-0005 failure mode 2). Such a
   * row is never below `pg_snapshot_xmin`, so no reader would ever see it.
   */
  async hasFutureXid(exec: DbExec): Promise<boolean> {
    const rows = await exec.execute<{ future: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM activity WHERE xid >= pg_snapshot_xmax(pg_current_snapshot())) AS future`
    );
    return rows[0]?.future ?? false;
  },

  /**
   * Restore repair: rewrite every entry's `xid` to 0 and return how many rows
   * that was. Ids keep the insertion order, so `(0, id)` is a total order that
   * every later (real) xid sorts after; a partial rewrite would put the
   * restored tail before older rows.
   */
  async zeroXids(exec: DbExec): Promise<number> {
    const rows = await exec
      .update(activity)
      .set({ xid: sql`'0'::xid8` })
      .returning({ id: activity.id });
    return rows.length;
  },

  /**
   * Label inputs for the Jobs a feed page names: the entries' own Jobs plus
   * every step of the playbook runs they collapse into. The caller passes ids
   * taken from an org-scoped read of the log; this method does not scope.
   */
  async jobLabelRows(
    exec: DbExec,
    opts: { jobIds: readonly string[]; playbookRunIds: readonly string[] }
  ): Promise<JobActivityLabelRow[]> {
    const jobIds = normalizeUuidList([...opts.jobIds]);
    const runIds = normalizeUuidList([...opts.playbookRunIds]);
    const match = [
      jobIds.length > 0 ? inArray(jobs.id, jobIds) : undefined,
      runIds.length > 0 ? inArray(jobs.playbookRunId, runIds) : undefined,
    ].filter((clause) => clause !== undefined);
    if (match.length === 0) return [];
    return exec
      .select({
        id: jobs.id,
        caseId: jobs.caseId,
        capabilityId: jobs.capabilityId,
        resultSummary: jobs.resultSummary,
        input: jobs.input,
        playbookRunId: jobs.playbookRunId,
        playbookStep: jobs.playbookStep,
        playbookFanIndex: jobs.playbookFanIndex,
        playbookId: playbookRuns.playbookId,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(or(...match))
      .orderBy(jobs.id);
  },

  /**
   * Recent activity: the newest entries the allowlist admits, newest first, in
   * one org-scoped query (the only read of the feed). Collapsed by `group_id`:
   * only the newest entry of each group survives (a playbook run's step Jobs
   * show as one row), and an entry with no group is its own group, so a solo
   * Job keeps its whole history. The collapse runs before the limit, so a busy
   * run cannot crowd the page.
   */
  async recentFeed(
    exec: DbExec,
    opts: RecentFeedOpts
  ): Promise<RecentActivityLogRow[]> {
    const admitted = opts.filters
      .filter((filter) => filter.actions.length > 0)
      .map((filter) =>
        and(
          eq(activity.kind, filter.kind),
          inArray(activity.action, [...filter.actions])
        )
      );
    if (admitted.length === 0) return [];
    const ranked = exec
      .select({
        id: activity.id,
        caseId: activity.caseId,
        caseName: cases.name,
        kind: activity.kind,
        action: activity.action,
        subjectId: activity.subjectId,
        groupId: activity.groupId,
        label: activity.label,
        fromValue: activity.fromValue,
        toValue: activity.toValue,
        actorId: activity.actorId,
        actorLabel: activity.actorLabel,
        at: activity.createdAt,
        newestInGroup:
          sql<number>`row_number() over (partition by coalesce(${activity.groupId}::text, ${activity.id}::text) order by ${activity.createdAt} desc, ${activity.id} desc)`.as(
            "newest_in_group"
          ),
      })
      .from(activity)
      .innerJoin(cases, eq(cases.id, activity.caseId))
      .where(
        and(
          orgCaseFilter(opts.organizationId, opts.caseId, activity.caseId),
          or(...admitted)
        )
      )
      .as("ranked");
    return exec
      .select({
        id: ranked.id,
        caseId: ranked.caseId,
        caseName: ranked.caseName,
        kind: ranked.kind,
        action: ranked.action,
        subjectId: ranked.subjectId,
        groupId: ranked.groupId,
        label: ranked.label,
        fromValue: ranked.fromValue,
        toValue: ranked.toValue,
        actorId: ranked.actorId,
        actorLabel: ranked.actorLabel,
        at: ranked.at,
      })
      .from(ranked)
      .where(eq(ranked.newestInGroup, 1))
      .orderBy(desc(ranked.at), desc(ranked.id))
      .limit(clampSearchLimit(opts.limit));
  },

  /**
   * Label inputs for the Proposals a feed page names: the Proposal's own
   * summary and patch plus the capability and playbook of the Job that made
   * it. The caller passes ids taken from an org-scoped read of the log; this
   * method does not scope.
   */
  async proposalLabelRows(
    exec: DbExec,
    proposalIds: readonly string[]
  ): Promise<ProposalActivityLabelRow[]> {
    const ids = normalizeUuidList([...proposalIds]);
    if (ids.length === 0) return [];
    return exec
      .select({
        id: proposals.id,
        caseId: proposals.caseId,
        summary: proposals.summary,
        patch: proposals.patch,
        capabilityId: jobs.capabilityId,
        playbookId: playbookRuns.playbookId,
      })
      .from(proposals)
      .leftJoin(jobs, eq(proposals.jobId, jobs.id))
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(inArray(proposals.id, ids))
      .orderBy(proposals.id);
  },
};
