import { and, desc, eq } from "drizzle-orm";

import type { ActivityKind } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { activityEvents } from "../schema/activity-events";
import { cases } from "../schema/cases";
import { clampSearchLimit } from "./_limits";
import { orgCaseFilter } from "./_org-case-filter";
import { trimActorId, trimCaseId, trimResourceId } from "./_scoped-ids";

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

export const activityEventsRepo = {
  async create(
    exec: DbExec,
    values: NewActivityEvent
  ): Promise<ActivityEventRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    const scopedSubjectId = trimResourceId(values.subjectId);
    if (scopedCaseId === undefined || scopedSubjectId === undefined) {
      return null;
    }
    const actorId =
      values.actorId === undefined || values.actorId === null
        ? values.actorId
        : (trimActorId(values.actorId) ?? null);
    const id =
      values.id === undefined
        ? undefined
        : (trimResourceId(values.id) ?? undefined);
    const [created] = await exec
      .insert(activityEvents)
      .values({
        ...values,
        id,
        caseId: scopedCaseId,
        subjectId: scopedSubjectId,
        actorId,
      })
      .returning();
    return created ?? null;
  },

  async recent(
    exec: DbExec,
    opts: RecentActivityEventOpts
  ): Promise<RecentActivityEventRow[]> {
    const safeLimit = clampSearchLimit(opts.limit);
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
          orgCaseFilter(
            opts.organizationId,
            opts.caseId,
            activityEvents.caseId
          ),
          opts.kind === undefined
            ? undefined
            : eq(activityEvents.kind, opts.kind)
        )
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(safeLimit);
  },
};
