import { Effect } from "effect";

import { db, eventsRepo, type EventRow } from "@watchdog/db";

import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCaseInOrgEffect, assertEntityInCaseEffect } from "./patch/guards";

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
  where?: string;
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
    yield* assertCaseInOrgEffect(caseId, organizationId);
    yield* assertEntityInCaseEffect(caseId, entityId, db);
    const rows = yield* tryDb(() => eventsRepo.listForEntity(db, entityId));
    return rows.map(toRecord);
  });
}

export function createEventEffect(
  input: CreateEventInput
): Effect.Effect<EventRecord, DomainTag> {
  return Effect.gen(function* createEventGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    yield* assertEntityInCaseEffect(input.caseId, input.entityId, db);
    const row = yield* tryDb(() =>
      eventsRepo.create(db, {
        entityId: input.entityId,
        when: input.when,
        what: input.what,
        whereText: input.where ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Event" });
    }
    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row);
  });
}

export function updateEventEffect(
  input: UpdateEventInput
): Effect.Effect<EventRecord, DomainTag> {
  return Effect.gen(function* updateEventGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const existing = yield* tryDb(() =>
      eventsRepo.getInCase(db, input.caseId, input.eventId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        resource: "Event not found in this Case",
      });
    }

    const row = yield* tryDb(() =>
      eventsRepo.update(db, input.eventId, {
        when: input.when ?? existing.when,
        what: input.what ?? existing.what,
        whereText:
          input.where === undefined ? existing.whereText : (input.where ?? null),
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to update Event" });
    }
    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row);
  });
}

export function deleteEventEffect(
  caseId: string,
  organizationId: string,
  eventId: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteEventGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const existing = yield* tryDb(() =>
      eventsRepo.getInCase(db, caseId, eventId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        resource: "Event not found in this Case",
      });
    }

    const deleted = yield* tryDb(() => eventsRepo.delete(db, eventId));
    if (!deleted) {
      return yield* new InvalidError({ reason: "Failed to delete Event" });
    }
    yield* notifyEntityChangedEffect(caseId);
  });
}
