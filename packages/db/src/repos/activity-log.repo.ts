import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  or,
  sql,
} from "drizzle-orm";

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

export type NewActivityRow = {
  caseId: CaseId;
  kind: ActivityEntryKind;
  action: string;
  subjectId?: string | null;
  groupId?: string | null;
  label?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
};

export type PruneActivityOpts = {
  /** Delete only entries created before this instant. */
  before: Date;
  /** Always keep this many newest entries (by id) of every Case. */
  keepPerCase: number;
  /** Delete at most this many entries. */
  limit: number;
  /** Delete only entries at or below this position (what a durable consumer has read). */
  notPast?: ActivityCursor | null;
};

export type PruneActivityResult = {
  /** Entries deleted by this batch. */
  count: number;
  /** The newest position deleted; `null` when nothing was. */
  newest: ActivityCursor | null;
};

export type DrainActivityOpts = {
  /** Exclusive lower bound. */
  after: ActivityCursor;
  limit: number;
  /** Scope to an organization's Cases (replay); omit for the process-wide tailer. */
  organizationId?: OrganizationId;
  caseId?: CaseId;
};

/** One kind and the actions of it the feed shows (`FEED_ACTIONS` in core). */
export type FeedFilter = {
  kind: ActivityEntryKind;
  actions: readonly string[];
};

export type RecentFeedOpts = {
  organizationId: OrganizationId;
  caseId?: CaseId;
  /** Allowlist of kind and action pairs; an entry outside every filter is never read. */
  filters: readonly FeedFilter[];
  limit: number;
  /** The clock the lookback window counts back from; tests and benchmarks pin it. */
  now?: Date;
};

/** Days of history the feed ranks first; a short page widens to the next, then to everything. */
const FEED_LOOKBACK_DAYS = [1, 7, 30] as const;
const DAY_MS = 86_400_000;

export type RecentActivityLogRow = {
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
};

/** What Recent activity needs to label a Proposal entry (Proposal labels are resolved on read). */
export type ProposalActivityLabelRow = {
  id: string;
  caseId: CaseId;
  summary: string | null;
  patch: PatchOp[];
  capabilityId: string | null;
  playbookId: string | null;
};

/** What Recent activity needs to label a Job entry (Job labels are resolved on read). */
export type JobActivityLabelRow = {
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
};

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

/** `(xid, id)` order; `xid8` values are compared as integers, not as text. */
function isNewer(a: ActivityCursor, b: ActivityCursor): boolean {
  const ax = BigInt(a.xid);
  const bx = BigInt(b.xid);
  return ax > bx || (ax === bx && a.id > b.id);
}

/**
 * The ids a prune batch deletes, oldest `(xid, id)` first. `keep_from` is the id of the
 * keep-th newest entry of a Case (0 when it has fewer), so only entries below it are beyond
 * the kept tail. It is computed once per Case in `keep`, by an index probe on
 * `activity_case_id_id_idx`, not once per candidate row by a correlated subquery. The probe
 * must say `NULLS LAST`: the index is `(case_id, id DESC NULLS LAST)`, and a bare `DESC`
 * (NULLS FIRST) is an order the index cannot give, so Postgres walked `activity_pkey`
 * backward instead and filtered every other Case's rows out.
 */
function pruneCandidatesQuery(opts: PruneActivityOpts, limit: number) {
  const keep = Math.max(0, Math.trunc(opts.keepPerCase));
  const bound = opts.notPast ?? null;
  const keepFrom =
    keep === 0
      ? sql`9223372036854775807::bigint`
      : sql`COALESCE((SELECT k.id FROM activity k WHERE k.case_id = c.id ORDER BY k.id DESC NULLS LAST OFFSET ${keep - 1} LIMIT 1), 0)`;
  const readByConsumers =
    bound === null
      ? sql`TRUE`
      : sql`(a.xid, a.id) <= (${bound.xid}::xid8, ${bound.id})`;
  return sql`
    WITH keep AS MATERIALIZED (
      SELECT c.id AS case_id, ${keepFrom} AS keep_from FROM cases c
    )
    SELECT a.id FROM activity a
    JOIN keep ON keep.case_id = a.case_id
    WHERE a.created_at < to_timestamp(${opts.before.getTime()}::double precision / 1000)
      AND a.id < keep.keep_from
      AND ${readByConsumers}
    ORDER BY a.xid, a.id
    LIMIT ${limit}`;
}

/** One pass of the feed: rank the admitted entries created at or after `since` (all when null). */
function rankedFeed(
  exec: DbExec,
  opts: RecentFeedOpts,
  filters: readonly FeedFilter[],
  limit: number,
  since: Date | null
): Promise<RecentActivityLogRow[]> {
  const admitted = filters.map((filter) =>
    and(
      eq(activity.kind, filter.kind),
      inArray(activity.action, [...filter.actions])
    )
  );
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
        or(...admitted),
        since === null ? undefined : gte(activity.createdAt, since)
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
    .limit(limit);
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
   *
   * Two statements: a SELECT picks the batch (so a plan assertion can read it;
   * a data-modifying CTE cannot be explained), then a DELETE by id.
   */
  async pruneBatch(
    exec: DbExec,
    opts: PruneActivityOpts
  ): Promise<PruneActivityResult> {
    const limit = Math.max(1, Math.trunc(opts.limit));
    const candidates = await exec.execute<{ id: string }>(
      pruneCandidatesQuery(opts, limit)
    );
    if (candidates.length === 0) return { count: 0, newest: null };
    const gone = await exec
      .delete(activity)
      .where(
        inArray(
          activity.id,
          candidates.map((row) => Number(row.id))
        )
      )
      .returning({ xid: activity.xid, id: activity.id });
    let newest: ActivityCursor | null = null;
    for (const row of gone) {
      if (newest === null || isNewer(row, newest)) {
        newest = { xid: row.xid, id: row.id };
      }
    }
    return { count: gone.length, newest };
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
   *
   * The collapse ranks entries inside a lookback window (`activity_created_at_id_idx`)
   * instead of the organization's whole history: one day, widened to 7, 30 and
   * finally everything while the page comes back short. The answer is the same
   * as ranking everything: a group's newest entry is inside any window that
   * holds one of its entries, and a group outside the window is older than
   * every group inside it, so a full page from a window is the full answer.
   */
  async recentFeed(
    exec: DbExec,
    opts: RecentFeedOpts
  ): Promise<RecentActivityLogRow[]> {
    const admitted = opts.filters.filter((filter) => filter.actions.length > 0);
    if (admitted.length === 0) return [];
    const limit = clampSearchLimit(opts.limit);
    const now = (opts.now ?? new Date()).getTime();
    for (const days of FEED_LOOKBACK_DAYS) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each window runs only if the last was short
      const rows = await rankedFeed(
        exec,
        opts,
        admitted,
        limit,
        new Date(now - days * DAY_MS)
      );
      if (rows.length >= limit) return rows;
    }
    return rankedFeed(exec, opts, admitted, limit, null);
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
