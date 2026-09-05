import { and, desc, eq } from "drizzle-orm";

import type { ActivityKind } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { activityEvents } from "../schema/activity-events";
import { cases } from "../schema/cases";

export type ActivityEventRow = typeof activityEvents.$inferSelect;

export type NewActivityEvent = Pick<
  typeof activityEvents.$inferInsert,
  "caseId" | "kind" | "action" | "subjectId" | "label"
> &
  Partial<
    Pick<
      typeof activityEvents.$inferInsert,
      "id" | "fromValue" | "toValue" | "actorId"
    >
  >;

export interface RecentActivityEventOpts {
  organizationId: string;
  caseId?: string;
  kind?: ActivityKind;
  limit: number;
}

export interface RecentActivityEventRow {
  id: string;
  caseId: string;
  caseName: string;
  kind: ActivityKind;
  action: string;
  subjectId: string;
  label: string;
  fromValue: string | null;
  toValue: string | null;
  actorId: string | null;
  at: Date;
}

function orgCaseFilter(organizationId: string, caseId: string | undefined) {
  return and(
    eq(cases.organizationId, organizationId),
    caseId === undefined ? undefined : eq(activityEvents.caseId, caseId)
  );
}

export const activityEventsRepo = {
  async create(
    exec: DbExec,
    values: NewActivityEvent
  ): Promise<ActivityEventRow | null> {
    const [created] = await exec
      .insert(activityEvents)
      .values(values)
      .returning();
    return created ?? null;
  },

  async recent(
    exec: DbExec,
    opts: RecentActivityEventOpts
  ): Promise<RecentActivityEventRow[]> {
    return exec
      .select({
        id: activityEvents.id,
        caseId: activityEvents.caseId,
        caseName: cases.name,
        kind: activityEvents.kind,
        action: activityEvents.action,
        subjectId: activityEvents.subjectId,
        label: activityEvents.label,
        fromValue: activityEvents.fromValue,
        toValue: activityEvents.toValue,
        actorId: activityEvents.actorId,
        at: activityEvents.createdAt,
      })
      .from(activityEvents)
      .innerJoin(cases, eq(cases.id, activityEvents.caseId))
      .where(
        and(
          orgCaseFilter(opts.organizationId, opts.caseId),
          opts.kind === undefined
            ? undefined
            : eq(activityEvents.kind, opts.kind)
        )
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(opts.limit);
  },
};
