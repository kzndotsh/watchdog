import { Effect } from "effect";

import {
  trimmedOrNull,
  trimmedOrUndefined,
  type CaseId,
  type OrganizationId,
  type GraphActor,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { InvalidError, type DomainTag } from "../infra/tagged-errors";
import { dossierChannel } from "./graph-activity";
import { runGraphMutation } from "./mutation/run-graph-mutation";
import { eventsTable, type EventRecord } from "./mutation/tables";
import { assertEntityInCaseEffect } from "./patch/guards";

export type { EventRecord };

export type CreateEventInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  entityId: string;
  when: string;
  what: string;
  where?: string;
} & GraphActor;

export type UpdateEventInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  eventId: string;
  /** The `version` the caller last read; an update of a row that moved on is `StaleVersionError`. */
  expectedVersion: number;
  when?: string;
  what?: string;
  where?: string | null;
} & GraphActor;

export function createEventEffect(
  input: CreateEventInput
): Effect.Effect<EventRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* createEventGen() {
        const entityId = yield* assertEntityInCaseEffect(
          w.caseId,
          input.entityId,
          w.tx
        );
        const when = trimmedOrUndefined(input.when);
        if (when === undefined) {
          return yield* new InvalidError({ reason: "Event when is required" });
        }
        const what = trimmedOrUndefined(input.what);
        if (what === undefined) {
          return yield* new InvalidError({ reason: "Event what is required" });
        }
        return yield* w.insert(eventsTable, {
          entityId,
          when,
          what,
          whereText: trimmedOrNull(input.where),
        });
      })
  );
}

export function updateEventEffect(
  input: UpdateEventInput
): Effect.Effect<EventRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* updateEventGen() {
        const existing = yield* w.get(eventsTable, input.eventId);
        let nextWhen = existing.when;
        if (input.when !== undefined) {
          const when = trimmedOrUndefined(input.when);
          if (when === undefined) {
            return yield* new InvalidError({
              reason: "Event when is required",
            });
          }
          nextWhen = when;
        }
        let nextWhat = existing.what;
        if (input.what !== undefined) {
          const what = trimmedOrUndefined(input.what);
          if (what === undefined) {
            return yield* new InvalidError({
              reason: "Event what is required",
            });
          }
          nextWhat = what;
        }
        return yield* w.update(
          eventsTable,
          existing.id,
          {
            when: nextWhen,
            what: nextWhat,
            whereText:
              input.where === undefined
                ? existing.whereText
                : trimmedOrNull(input.where),
          },
          { expectedVersion: input.expectedVersion }
        );
      })
  );
}

export function deleteEventEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  eventId: string,
  actor?: GraphActor
): Effect.Effect<void, DomainTag, Db> {
  return runGraphMutation(
    { caseId, organizationId, actor, channel: dossierChannel(actor) },
    (w) => w.remove(eventsTable, eventId).pipe(Effect.asVoid)
  );
}
