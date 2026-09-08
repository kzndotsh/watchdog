import { and, asc, eq } from "drizzle-orm";

import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { events } from "../schema/events";
import { entityRowInCase } from "./_entity-in-case";
import { trimResourceId, trimScopedCaseIds } from "./_scoped-ids";

export const eventColumns = {
  id: events.id,
  entityId: events.entityId,
  when: events.when,
  what: events.what,
  whereText: events.whereText,
} as const;

export type EventRow = {
  [K in keyof typeof eventColumns]: (typeof events.$inferSelect)[K &
    keyof typeof events.$inferSelect];
};

export type NewEvent = Pick<
  typeof events.$inferInsert,
  "entityId" | "when" | "what" | "whereText"
> &
  Partial<Pick<typeof events.$inferInsert, "id">>;

export type EventPatch = Pick<
  typeof events.$inferInsert,
  "when" | "what" | "whereText"
>;

function eventTextForWrite(text: string): string | undefined {
  return trimmedOrUndefined(text);
}

function eventWhereForWrite(
  whereText: string | null | undefined
): string | null | undefined {
  if (whereText === undefined) return undefined;
  return trimmedOrNull(whereText);
}

function eventPatchForWrite(patch: EventPatch): EventPatch | null {
  const next: EventPatch = { ...patch };
  if (patch.when !== undefined) {
    const when = eventTextForWrite(patch.when);
    if (when === undefined) return null;
    next.when = when;
  }
  if (patch.what !== undefined) {
    const what = eventTextForWrite(patch.what);
    if (what === undefined) return null;
    next.what = what;
  }
  if (patch.whereText !== undefined) {
    next.whereText = eventWhereForWrite(patch.whereText) ?? null;
  }
  return next;
}

export const eventsRepo = {
  async listForEntity(exec: DbExec, entityId: string): Promise<EventRow[]> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return [];
    return exec
      .select(eventColumns)
      .from(events)
      .where(eq(events.entityId, scopedEntityId))
      .orderBy(asc(events.when));
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    eventId: string
  ): Promise<EventRow | null> {
    const scoped = trimScopedCaseIds(caseId, eventId);
    if (!scoped) return null;
    const [row] = await exec
      .select(eventColumns)
      .from(events)
      .innerJoin(entities, eq(events.entityId, entities.id))
      .where(
        and(
          eq(events.id, scoped.resourceId),
          eq(entities.caseId, scoped.caseId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async create(exec: DbExec, values: NewEvent): Promise<EventRow | null> {
    const scopedEntityId = trimResourceId(values.entityId);
    if (scopedEntityId === undefined) return null;
    const when = eventTextForWrite(values.when);
    const what = eventTextForWrite(values.what);
    if (when === undefined || what === undefined) return null;
    const id =
      values.id === undefined
        ? undefined
        : (trimResourceId(values.id) ?? undefined);
    const whereText = eventWhereForWrite(values.whereText);
    const [created] = await exec
      .insert(events)
      .values({
        ...values,
        id,
        entityId: scopedEntityId,
        when,
        what,
        ...(whereText === undefined ? {} : { whereText }),
      })
      .returning(eventColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    eventId: string,
    patch: EventPatch
  ): Promise<EventRow | null> {
    const scopedEventId = trimResourceId(eventId);
    if (scopedEventId === undefined) return null;
    const normalizedPatch = eventPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(events)
      .set(normalizedPatch)
      .where(eq(events.id, scopedEventId))
      .returning(eventColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: string,
    eventId: string,
    patch: EventPatch
  ): Promise<EventRow | null> {
    const scoped = trimScopedCaseIds(caseId, eventId);
    if (!scoped) return null;
    const normalizedPatch = eventPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(events)
      .set(normalizedPatch)
      .where(
        and(
          eq(events.id, scoped.resourceId),
          entityRowInCase(events.entityId, scoped.caseId)
        )
      )
      .returning(eventColumns);
    return updated ?? null;
  },

  async delete(exec: DbExec, eventId: string): Promise<EventRow | null> {
    const scopedEventId = trimResourceId(eventId);
    if (scopedEventId === undefined) return null;
    const [deleted] = await exec
      .delete(events)
      .where(eq(events.id, scopedEventId))
      .returning(eventColumns);
    return deleted ?? null;
  },

  async deleteInCase(
    exec: DbExec,
    caseId: string,
    eventId: string
  ): Promise<EventRow | null> {
    const scoped = trimScopedCaseIds(caseId, eventId);
    if (!scoped) return null;
    const [deleted] = await exec
      .delete(events)
      .where(
        and(
          eq(events.id, scoped.resourceId),
          entityRowInCase(events.entityId, scoped.caseId)
        )
      )
      .returning(eventColumns);
    return deleted ?? null;
  },
};
