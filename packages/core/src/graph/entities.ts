import { Effect } from "effect";

import { entitiesRepo } from "@watchdog/db";
import type {
  CaseId,
  EntityKind,
  OrganizationId,
  Page,
} from "@watchdog/schemas/shared";
import {
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { pageWindow, toPage } from "../infra/page";
import type { PageRequest } from "../infra/page";
import { tryDb, tryDbWith } from "../infra/postgres-effect";
import {
  boundEchoedId,
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertEntityKindChangeAllowedEffect } from "./edge-update";
import { dossierChannel, type GraphActor } from "./graph-activity";
import { runGraphMutation } from "./mutation/run-graph-mutation";
import {
  entitiesTable,
  toEntityRecord,
  type EntityRecord,
} from "./mutation/tables";
import { assertCaseInOrgEffect } from "./patch/guards";
import { seedDefaultQuestionsEffect } from "./questions";

export type { EntityRecord };

export type CreateEntityInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  kind: EntityKind;
  name: string;
  slug: string;
} & GraphActor;

export type UpdateEntityFieldsInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  entityId: string;
  /** The `version` the caller last read; an update of a row that moved on is `StaleVersionError`. */
  expectedVersion: number;
  kind?: EntityKind;
  name?: string;
  summary?: string | null;
  notes?: string | null;
} & GraphActor;

/** One page of the Case's Entities, by name then id. */
export function listEntitiesForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  page: PageRequest = {}
): Effect.Effect<Page<EntityRecord>, DomainTag, Db> {
  return Effect.gen(function* listEntitiesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const window = yield* pageWindow(page, {
      list: "entities",
      keys: ["text"],
    });
    const rows = yield* tryDbWith((exec) =>
      entitiesRepo.listPageForCase(exec, scopedCaseId, {
        limit: window.limit + 1,
        ...(window.after === undefined ? {} : { after: window.after }),
      })
    );
    return toPage(rows, window, toEntityRecord, (row) => ({
      id: row.id,
      values: [row.name],
    }));
  });
}

export function getEntityByCaseSlugEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  slug: string
): Effect.Effect<EntityRecord, DomainTag, Db> {
  return Effect.gen(function* getEntityByCaseSlugGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedSlug = slugifyName(slug);
    if (normalizedSlug === "") {
      return yield* new NotFoundError({
        entity: "Entity",
        id: boundEchoedId(slug),
      });
    }
    const row = yield* tryDbWith((exec) =>
      entitiesRepo.getByCaseSlug(exec, scopedCaseId, normalizedSlug)
    );
    if (!row) {
      return yield* new NotFoundError({
        entity: "Entity",
        id: boundEchoedId(slug),
      });
    }
    return toEntityRecord(row);
  });
}

export function createEntityEffect(
  input: CreateEntityInput
): Effect.Effect<EntityRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* createEntityGen() {
        const name = trimmedOrUndefined(input.name);
        if (name === undefined) {
          return yield* new InvalidError({ reason: "Entity name is required" });
        }
        const slug = slugifyName(input.slug);
        if (slug === "") {
          return yield* new InvalidError({ reason: "Entity slug is required" });
        }
        const existing = yield* tryDb(() =>
          entitiesRepo.getByCaseSlug(w.tx, w.caseId, slug)
        );
        if (existing) {
          return yield* new ConflictError({
            reason: `Slug "${slug}" already exists in this Case`,
          });
        }
        const record = yield* w.insert(entitiesTable, {
          kind: input.kind,
          name,
          slug,
        });
        // Seeding appends no entries of its own: a registered helper, not a module write.
        yield* seedDefaultQuestionsEffect(w.tx, {
          id: record.id,
          caseId: record.caseId,
          kind: record.kind,
        });
        return record;
      })
  );
}

export function updateEntityFieldsEffect(
  input: UpdateEntityFieldsInput
): Effect.Effect<EntityRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* updateEntityGen() {
        const existing = yield* w.get(entitiesTable, input.entityId);
        const nextName =
          input.name === undefined ? undefined : trimmedOrUndefined(input.name);
        if (input.name !== undefined && nextName === undefined) {
          return yield* new InvalidError({ reason: "Entity name is required" });
        }
        if (input.kind !== undefined && input.kind !== existing.kind) {
          yield* assertEntityKindChangeAllowedEffect(
            w.caseId,
            existing.id,
            input.kind,
            w.tx
          );
        }
        return yield* w.update(
          entitiesTable,
          existing.id,
          {
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            ...(nextName === undefined ? {} : { name: nextName }),
            ...(input.summary === undefined
              ? {}
              : { summary: trimmedOrNull(input.summary) }),
            ...(input.notes === undefined
              ? {}
              : { notes: trimmedOrNull(input.notes) }),
          },
          { expectedVersion: input.expectedVersion }
        );
      })
  );
}

export function deleteEntityEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string,
  actor?: GraphActor
): Effect.Effect<void, DomainTag, Db> {
  return runGraphMutation(
    { caseId, organizationId, actor, channel: dossierChannel(actor) },
    (w) => Effect.asVoid(w.remove(entitiesTable, entityId))
  );
}
