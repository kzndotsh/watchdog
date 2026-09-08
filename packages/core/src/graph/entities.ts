import { Effect } from "effect";

import { db, entitiesRepo, type EntityRow } from "@watchdog/db";
import type { EntityKind } from "@watchdog/schemas";
import { slugifyName, trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas";

import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCaseInOrgEffect, requireTrimmedGraphId } from "./patch/guards";
import { seedDefaultQuestionsEffect } from "./questions";
import { assertEntityKindChangeAllowedEffect } from "./edge-update";

const SLUG_UNIQUE_INDEX = "entities_case_slug_uidx";

export interface EntityRecord {
  id: string;
  caseId: string;
  kind: EntityKind;
  name: string;
  slug: string;
  summary: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEntityInput {
  caseId: string;
  organizationId: string;
  kind: EntityKind;
  name: string;
  slug: string;
}

export interface UpdateEntityFieldsInput {
  caseId: string;
  organizationId: string;
  entityId: string;
  kind?: EntityKind;
  name?: string;
  summary?: string | null;
  notes?: string | null;
}

function toRecord(row: EntityRow): EntityRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    summary: row.summary ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function listEntitiesForCaseEffect(
  caseId: string,
  organizationId: string
): Effect.Effect<EntityRecord[], DomainTag> {
  return Effect.gen(function* listEntitiesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() => entitiesRepo.listForCase(db, scopedCaseId));
    return rows.map(toRecord);
  });
}

export function getEntityByCaseSlugEffect(
  caseId: string,
  organizationId: string,
  slug: string
): Effect.Effect<EntityRecord, DomainTag> {
  return Effect.gen(function* getEntityByCaseSlugGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedSlug = slugifyName(slug);
    if (normalizedSlug === "") {
      return yield* new NotFoundError({ resource: "Entity not found" });
    }
    const row = yield* tryDb(() =>
      entitiesRepo.getByCaseSlug(db, scopedCaseId, normalizedSlug)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Entity not found" });
    }
    return toRecord(row);
  });
}

export function createEntityEffect(
  input: CreateEntityInput
): Effect.Effect<EntityRecord, DomainTag> {
  return Effect.gen(function* createEntityGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const name = trimmedOrUndefined(input.name);
    if (name === undefined) {
      return yield* new InvalidError({ reason: "Entity name is required" });
    }
    const slug = slugifyName(input.slug);
    if (slug === "") {
      return yield* new InvalidError({ reason: "Entity slug is required" });
    }
    const conflictReason = `Slug "${slug}" already exists in this Case`;
    const existing = yield* tryDb(() =>
      entitiesRepo.getByCaseSlug(db, scopedCaseId, slug)
    );
    if (existing) {
      return yield* new ConflictError({ reason: conflictReason });
    }

    const created = yield* transact(
      (tx) =>
        Effect.gen(function* createEntityTx() {
          const row = yield* tryDb(() =>
            entitiesRepo.create(tx, {
              caseId: scopedCaseId,
              kind: input.kind,
              name,
              slug,
            })
          );
          if (!row) {
            return yield* new InvalidError({
              reason: "Failed to create Entity",
            });
          }
          yield* seedDefaultQuestionsEffect(tx, row);
          return row;
        }),
      { uniqueIndex: SLUG_UNIQUE_INDEX, conflictReason }
    );

    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(created);
  });
}

export function updateEntityFieldsEffect(
  input: UpdateEntityFieldsInput
): Effect.Effect<EntityRecord, DomainTag> {
  return Effect.gen(function* updateEntityGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const entityId = yield* requireTrimmedGraphId(
      input.entityId,
      "Entity not found"
    );
    const existing = yield* tryDb(() =>
      entitiesRepo.getInCase(db, scopedCaseId, entityId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Entity not found" });
    }

    const nextName =
      input.name === undefined ? undefined : trimmedOrUndefined(input.name);
    if (input.name !== undefined && nextName === undefined) {
      return yield* new InvalidError({ reason: "Entity name is required" });
    }

    if (input.kind !== undefined && input.kind !== existing.kind) {
      yield* assertEntityKindChangeAllowedEffect(
        scopedCaseId,
        entityId,
        input.kind,
        db
      );
    }

    const updated = yield* tryDb(() =>
      entitiesRepo.updateInCase(db, scopedCaseId, entityId, {
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(nextName === undefined ? {} : { name: nextName }),
        ...(input.summary === undefined
          ? {}
          : { summary: trimmedOrNull(input.summary) }),
        ...(input.notes === undefined
          ? {}
          : { notes: trimmedOrNull(input.notes) }),
      })
    );
    if (!updated) {
      return yield* new InvalidError({ reason: "Failed to update Entity" });
    }

    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(updated);
  });
}

export function deleteEntityEffect(
  caseId: string,
  organizationId: string,
  entityId: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteEntityGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(
      entityId,
      "Entity not found"
    );
    const existing = yield* tryDb(() =>
      entitiesRepo.getInCase(db, scopedCaseId, normalizedEntityId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Entity not found" });
    }

    const deleted = yield* tryDb(() =>
      entitiesRepo.deleteInCase(db, scopedCaseId, normalizedEntityId)
    );
    if (!deleted) {
      return yield* new InvalidError({ reason: "Failed to delete Entity" });
    }

    yield* notifyEntityChangedEffect(scopedCaseId);
  });
}
