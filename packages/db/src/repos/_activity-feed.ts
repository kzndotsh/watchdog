import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { FEED_ACTIONS } from "@watchdog/schemas/feed";

import { activity } from "../schema/activity";
import { cases } from "../schema/cases";

/*
 * The predicates of Recent activity's scope (`activity-list.repo.ts`), kept beside the other raw
 * SQL (`watchdog/db-repo-no-raw-sql` keeps the repos on the builder API): correlated subqueries
 * a list scope needs, which the typed builder cannot name without a handle to run them on.
 */

const newer = alias(activity, "newer");
const caseOf = alias(cases, "feed_case");

/** The `(kind, action)` pairs of `FEED_ACTIONS` over one alias of the log. */
function admittedOf(table: {
  readonly kind: AnyColumn;
  readonly action: AnyColumn;
}) {
  return or(
    ...Object.entries(FEED_ACTIONS).map(([kind, actions]) =>
      and(eq(table.kind, kind), inArray(table.action, [...actions]))
    )
  );
}

/** An entry the allowlist admits. */
export const feedAdmitted = admittedOf(activity);

/**
 * The newest admitted entry of its `group_id` (a playbook run's step Jobs show as one row); an
 * entry with no group is its own group, so a solo Job keeps its whole history. Newest is
 * `(created_at, id)` largest, probed through `activity_group_created_idx`.
 */
export const newestOfGroup = sql`(${activity.groupId} is null or not exists (
  select 1 from "activity" as "newer"
  where ${newer.groupId} = ${activity.groupId}
    and ${admittedOf(newer)}
    and (${newer.createdAt}, ${newer.id}) > (${activity.createdAt}, ${activity.id})
))`;

/** The entry's Case is not tombstoned: the feed never shows a deleted Case's history. */
export const inVisibleCase = sql`exists (
  select 1 from "cases" as "feed_case"
  where ${caseOf.id} = ${activity.caseId} and ${caseOf.deletedAt} is null
)`;

/** A condition no entry meets: a Case filter that names no Case. */
export const noEntry = sql`false`;
