import { Effect } from "effect";

import {
  trimmedOrNull,
  trimmedOrUndefined,
  type CaseId,
  type OrganizationId,
  type Page,
  type GraphActor,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { pageWindow, toPage } from "../infra/page";
import type { PageRequest } from "../infra/page";
import { eventsRepoFxDb } from "../infra/repos-fx";
import { InvalidError, type DomainTag } from "../infra/tagged-errors";
import { dossierChannel } from "./graph-activity";
import { runGraphMutation } from "./mutation/run-graph-mutation";
import {
  eventsTable,
  toEventRecord,
  type EventRecord,
} from "./mutation/tables";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

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

/** One page of an Entity's Events, by `when` then id. */
export function listEventsForEntityEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string,
  page: PageRequest = {}
): Effect.Effect<Page<EventRecord>, DomainTag, Db> {
  return Effect.gen(function* listEventsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId);
    const window = yield* pageWindow(page, { list: "events", keys: ["text"] });
    const rows = yield* eventsRepoFxDb.listForEntity(normalizedEntityId, {
      limit: window.limit + 1,
      ...(window.after === undefined ? {} : { after: window.after }),
    });
    return toPage(rows, window, toEventRecord, (row) => ({
      id: row.id,
      values: [row.when],
    }));
  });
}

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
