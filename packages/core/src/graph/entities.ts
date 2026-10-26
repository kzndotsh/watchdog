import { Effect } from "effect";

import { entityListRepo } from "@watchdog/db";
import type { EntityListRow } from "@watchdog/db";
import { entityList } from "@watchdog/schemas/graph";
import type {
  CaseId,
  EntityKind,
  ListInput,
  ListPage,
  OrganizationId,
  GraphActor,
} from "@watchdog/schemas/shared";
import {
  PAGE_LIMIT_DEFAULT,
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { listByIdsEffect, listPageEffect } from "../infra/list-page";
import { entitiesRepoFxDb, entitiesRepoFx } from "../infra/repos-fx";
import {
  boundEchoedId,
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertEntityKindChangeAllowedEffect } from "./edge-update";
import { dossierChannel } from "./graph-activity";
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

/** Rows of the Entity list to wire records (no joins, no extra reads). */
function entityItems(
  rows: readonly EntityListRow[]
): Effect.Effect<readonly EntityRecord[], DomainTag, Db> {
  return Effect.succeed(rows.map((row) => toEntityRecord(row)));
}

/**
 * One page of the Case's Entity list (`entityList`, ADR-0007): the declared filters, `q` and
 * sort, keyset paged, with `total` on the first page. Without `input` it is the first page of
 * the default view.
 */
export function listEntitiesForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input?: ListInput<typeof entityList>
): Effect.Effect<ListPage<EntityRecord>, DomainTag, Db> {
  return Effect.gen(function* listEntitiesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: entityList,
      repo: entityListRepo,
      scope: { caseId: scopedCaseId },
      input: input ?? { caseId: scopedCaseId, limit: PAGE_LIMIT_DEFAULT },
      toItems: entityItems,
    });
  });
}

/**
 * The Case's Entities with these ids (a picker's selected value, a filter chip's title), at most
 * `ARRAY_MAX`. Ids outside the Case are left out, so the result may be shorter than `ids`.
 */
export function getEntitiesByIdsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  ids: readonly string[]
): Effect.Effect<EntityRecord[], DomainTag, Db> {
  return Effect.gen(function* getEntitiesByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: entityListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: entityItems,
    });
    return [...items];
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
    const row = yield* entitiesRepoFxDb.getByCaseSlug(
      scopedCaseId,
      normalizedSlug
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
        const existing = yield* entitiesRepoFx.getByCaseSlug(
          w.tx,
          w.caseId,
          slug
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
