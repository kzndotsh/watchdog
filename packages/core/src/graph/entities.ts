import { Effect } from "effect";

import { db, entitiesRepo, type EntityRow } from "@watchdog/db";
import type { EntityKind } from "@watchdog/schemas";

import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCaseInOrgEffect } from "./patch/guards";
import { seedDefaultQuestionsEffect } from "./questions";

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
  summary?: string;
  notes?: string;
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
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() => entitiesRepo.listForCase(db, caseId));
    return rows.map(toRecord);
  });
}

export function getEntityByCaseSlugEffect(
  caseId: string,
  organizationId: string,
  slug: string
): Effect.Effect<EntityRecord, DomainTag> {
  return Effect.gen(function* getEntityByCaseSlugGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const row = yield* tryDb(() =>
      entitiesRepo.getByCaseSlug(db, caseId, slug)
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
  const conflictReason = `Slug "${input.slug}" already exists in this Case`;
  return Effect.gen(function* createEntityGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const existing = yield* tryDb(() =>
      entitiesRepo.getByCaseSlug(db, input.caseId, input.slug)
    );
    if (existing) {
      return yield* new ConflictError({ reason: conflictReason });
    }

    const created = yield* transact((tx) =>
      Effect.gen(function* createEntityTx() {
        const row = yield* tryDb(() =>
          entitiesRepo.create(tx, {
            caseId: input.caseId,
            kind: input.kind,
            name: input.name,
            slug: input.slug,
          })
        );
        if (!row) {
          return yield* new InvalidError({
            reason: "Failed to create Entity",
          });
        }
        yield* seedDefaultQuestionsEffect(tx, row);
        return row;
      })
    );

    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(created);
  });
}

export function updateEntityFieldsEffect(
  input: UpdateEntityFieldsInput
): Effect.Effect<EntityRecord, DomainTag> {
  return Effect.gen(function* updateEntityGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const existing = yield* tryDb(() =>
      entitiesRepo.getInCase(db, input.caseId, input.entityId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Entity not found" });
    }

    const updated = yield* tryDb(() =>
      entitiesRepo.update(db, input.entityId, {
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.summary === undefined
          ? {}
          : { summary: input.summary || null }),
        ...(input.notes === undefined ? {} : { notes: input.notes || null }),
      })
    );
    if (!updated) {
      return yield* new InvalidError({ reason: "Failed to update Entity" });
    }

    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(updated);
  });
}
