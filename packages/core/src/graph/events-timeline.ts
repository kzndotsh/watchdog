import { Effect } from "effect";

import { eventsRepo, type EventRow } from "@watchdog/db";
import {
  trimmedOrNull,
  trimmedOrUndefined,
  type CaseId,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { notifyEntityChangedEffect } from "../infra/events";
import { tryDbWith } from "../infra/postgres-effect";
import {
  InternalError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

export interface EventRecord {
  id: string;
  entityId: string;
  when: string;
  what: string;
  where: string | null;
}

export interface CreateEventInput {
  caseId: CaseId;
  organizationId: OrganizationId;
  entityId: string;
  when: string;
  what: string;
  where?: string;
}

export interface UpdateEventInput {
  caseId: CaseId;
  organizationId: OrganizationId;
  eventId: string;
  when?: string;
  what?: string;
  where?: string | null;
}

function toRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    when: row.when,
    what: row.what,
    where: row.whereText,
  };
}

export function listEventsForEntityEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string
): Effect.Effect<EventRecord[], DomainTag, Db> {
  return Effect.gen(function* listEventsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId);
    const rows = yield* tryDbWith((exec) =>
      eventsRepo.listForEntity(exec, normalizedEntityId)
    );
    return rows.map(toRecord);
  });
}

export function createEventEffect(
  input: CreateEventInput
): Effect.Effect<EventRecord, DomainTag, Db> {
  return Effect.gen(function* createEventGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const entityId = yield* requireTrimmedGraphId(input.entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, entityId);
    const when = trimmedOrUndefined(input.when);
    if (when === undefined) {
      return yield* new InvalidError({ reason: "Event when is required" });
    }
    const what = trimmedOrUndefined(input.what);
    if (what === undefined) {
      return yield* new InvalidError({ reason: "Event what is required" });
    }
    const row = yield* tryDbWith((exec) =>
      eventsRepo.create(exec, {
        entityId,
        when,
        what,
        whereText: trimmedOrNull(input.where),
      })
    );
    if (!row) {
      return yield* new InternalError({ reason: "Failed to create Event" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row);
  });
}

export function updateEventEffect(
  input: UpdateEventInput
): Effect.Effect<EventRecord, DomainTag, Db> {
  return Effect.gen(function* updateEventGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const eventId = yield* requireTrimmedGraphId(input.eventId, "Event");
    const existing = yield* tryDbWith((exec) =>
      eventsRepo.getInCase(exec, scopedCaseId, eventId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Event", id: eventId });
    }

    let nextWhen = existing.when;
    if (input.when !== undefined) {
      const when = trimmedOrUndefined(input.when);
      if (when === undefined) {
        return yield* new InvalidError({ reason: "Event when is required" });
      }
      nextWhen = when;
    }
    let nextWhat = existing.what;
    if (input.what !== undefined) {
      const what = trimmedOrUndefined(input.what);
      if (what === undefined) {
        return yield* new InvalidError({ reason: "Event what is required" });
      }
      nextWhat = what;
    }

    const row = yield* tryDbWith((exec) =>
      eventsRepo.updateInCase(exec, scopedCaseId, eventId, {
        when: nextWhen,
        what: nextWhat,
        whereText:
          input.where === undefined
            ? existing.whereText
            : trimmedOrNull(input.where),
      })
    );
    if (!row) {
      return yield* new NotFoundError({ entity: "Event", id: eventId });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row);
  });
}

export function deleteEventEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  eventId: string
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* deleteEventGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEventId = yield* requireTrimmedGraphId(eventId, "Event");
    const existing = yield* tryDbWith((exec) =>
      eventsRepo.getInCase(exec, scopedCaseId, normalizedEventId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        entity: "Event",
        id: normalizedEventId,
      });
    }

    const deleted = yield* tryDbWith((exec) =>
      eventsRepo.deleteInCase(exec, scopedCaseId, normalizedEventId)
    );
    if (!deleted) {
      return yield* new NotFoundError({
        entity: "Event",
        id: normalizedEventId,
      });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
  });
}
