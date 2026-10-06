import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";

import type { ActivityCursor, ActivityEntryKind } from "@watchdog/schemas/feed";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { activity } from "../schema/activity";
import { cases } from "../schema/cases";
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

export interface DrainActivityOpts {
  /** Exclusive lower bound. */
  after: ActivityCursor;
  limit: number;
  /** Scope to an organization's Cases (replay); omit for the process-wide tailer. */
  organizationId?: OrganizationId;
  caseId?: string;
}

export interface RecentActivityLogOpts {
  organizationId: OrganizationId;
  caseId?: string;
  kind: ActivityEntryKind;
  /** The feed allowlist for the kind (`FEED_ACTIONS` in core). */
  actions: readonly string[];
  limit: number;
}

export interface RecentActivityLogRow {
  id: number;
  caseId: CaseId;
  caseName: string;
  kind: ActivityEntryKind;
  action: string;
  subjectId: string | null;
  label: string | null;
  fromValue: string | null;
  toValue: string | null;
  actorId: string | null;
  at: Date;
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

  /** Recent entries of one kind for the workspace feed, newest first. */
  async recent(
    exec: DbExec,
    opts: RecentActivityLogOpts
  ): Promise<RecentActivityLogRow[]> {
    if (opts.actions.length === 0) return [];
    return exec
      .select({
        id: activity.id,
        caseId: activity.caseId,
        caseName: cases.name,
        kind: activity.kind,
        action: activity.action,
        subjectId: activity.subjectId,
        label: activity.label,
        fromValue: activity.fromValue,
        toValue: activity.toValue,
        actorId: activity.actorId,
        at: activity.createdAt,
      })
      .from(activity)
      .innerJoin(cases, eq(cases.id, activity.caseId))
      .where(
        and(
          orgCaseFilter(opts.organizationId, opts.caseId, activity.caseId),
          eq(activity.kind, opts.kind),
          inArray(activity.action, [...opts.actions])
        )
      )
      .orderBy(desc(activity.createdAt), desc(activity.id))
      .limit(clampSearchLimit(opts.limit));
  },
};
