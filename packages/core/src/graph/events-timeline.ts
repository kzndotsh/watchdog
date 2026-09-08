import { Effect } from "effect";

import { db, eventsRepo, type EventRow } from "@watchdog/db";
import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas";

import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCaseInOrgEffect, assertEntityInCaseEffect, requireTrimmedGraphId } from "./patch/guards";

export interface EventRecord {
  id: string;
  entityId: string;
  when: string;
  what: string;
  where: string | null;
}

export interface CreateEventInput {
  caseId: string;
  organizationId: string;
  entityId: string;
  when: string;
  what: string;
  where?: string;
}

export interface UpdateEventInput {
  caseId: string;
  organizationId: string;
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
  caseId: string,
  organizationId: string,
  entityId: string
): Effect.Effect<EventRecord[], DomainTag> {
  return Effect.gen(function* listEventsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(
      entityId,
      "Entity not found in this Case"
    );
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId, db);
    const rows = yield* tryDb(() =>
      eventsRepo.listForEntity(db, normalizedEntityId)
    );
    return rows.map(toRecord);
  });
}

export function createEventEffect(
  input: CreateEventInput
): Effect.Effect<EventRecord, DomainTag> {
  return Effect.gen(function* createEventGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const entityId = yield* requireTrimmedGraphId(
      input.entityId,
      "Entity not found in this Case"
    );
    yield* assertEntityInCaseEffect(scopedCaseId, entityId, db);
    const when = trimmedOrUndefined(input.when);
    if (when === undefined) {
      return yield* new InvalidError({ reason: "Event when is required" });
    }
    const what = trimmedOrUndefined(input.what);
    if (what === undefined) {
      return yield* new InvalidError({ reason: "Event what is required" });
    }
    const row = yield* tryDb(() =>
      eventsRepo.create(db, {
        entityId,
        when,
        what,
        whereText: trimmedOrNull(input.where),
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Event" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row);
  });
}

export function updateEventEffect(
  input: UpdateEventInput
): Effect.Effect<EventRecord, DomainTag> {
  return Effect.gen(function* updateEventGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const eventId = yield* requireTrimmedGraphId(
      input.eventId,
      "Event not found in this Case"
    );
    const existing = yield* tryDb(() =>
      eventsRepo.getInCase(db, scopedCaseId, eventId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        resource: "Event not found in this Case",
      });
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

    const row = yield* tryDb(() =>
      eventsRepo.updateInCase(db, scopedCaseId, eventId, {
        when: nextWhen,
        what: nextWhat,
        whereText:
          input.where === undefined
            ? existing.whereText
            : trimmedOrNull(input.where),
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to update Event" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row);
  });
}

export function deleteEventEffect(
  caseId: string,
  organizationId: string,
  eventId: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteEventGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEventId = yield* requireTrimmedGraphId(
      eventId,
      "Event not found in this Case"
    );
    const existing = yield* tryDb(() =>
      eventsRepo.getInCase(db, scopedCaseId, normalizedEventId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        resource: "Event not found in this Case",
      });
    }

    const deleted = yield* tryDb(() =>
      eventsRepo.deleteInCase(db, scopedCaseId, normalizedEventId)
    );
    if (!deleted) {
      return yield* new InvalidError({ reason: "Failed to delete Event" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
  });
}
