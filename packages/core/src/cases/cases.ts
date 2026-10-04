import { Effect } from "effect";

import { casesRepo, db, type CaseRow } from "@watchdog/db";
import {
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas/shared";

import { optionalActorId } from "../actors/require-actor-id";
import { requireTrimmedGraphId } from "../graph/patch/guards";
import { deleteCaseArtifactsEffect } from "../infra/blob";
import type { Db } from "../infra/db-service";
import { notifyEntityChangedEffect } from "../infra/events";
import {
  removeCaseExportDirEffect,
  renameCaseExportDirEffect,
  scheduleCaseExportEffect,
} from "../infra/export-sync";
import { tryDb, tryDbWith } from "../infra/postgres-effect";
import { logProcess, logSwallowed } from "../infra/process-log";
import {
  ConflictError,
  InternalError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";

const SLUG_UNIQUE_INDEX = "cases_organization_id_slug_uidx";

export interface CaseRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  allowThirdPartyEgress: boolean;
}

export interface CreateCaseInput {
  name: string;
  slug?: string;
  description?: string;
  organizationId: string;
}

/** Derive the Case URL slug from a display name. Empty if unsugifiable. */
export function slugForCaseName(name: string): string {
  return slugifyName(name);
}

function toRecord(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    allowThirdPartyEgress: row.allowThirdPartyEgress,
  };
}

/** Reference for the `Db` service pattern (ADR-0002 phase 2): R = `Db`, client from `tryDbWith`. */
export function listCasesEffect(
  organizationId: string
): Effect.Effect<CaseRecord[], DomainTag, Db> {
  return tryDbWith((exec) => casesRepo.list(exec, organizationId)).pipe(
    Effect.map((rows) => rows.map(toRecord))
  );
}

/**
 * Ids of every Case the organization can see. The live events stream filters
 * NOTIFY payloads against this set, so Case visibility is decided here, with the
 * same organization scope as every other Case read.
 */
export function listVisibleCaseIdsEffect(
  organizationId: string
): Effect.Effect<string[], DomainTag> {
  return tryDb(() => casesRepo.listIds(db, organizationId));
}

export function getCaseByIdEffect(
  id: string,
  organizationId: string
): Effect.Effect<CaseRecord, DomainTag> {
  return Effect.gen(function* getCaseByIdGen() {
    const caseId = yield* requireTrimmedGraphId(id, "Case");
    const row = yield* tryDb(() =>
      casesRepo.getById(db, caseId, organizationId)
    );
    if (!row) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }
    return toRecord(row);
  });
}

export function getCaseBySlugEffect(
  slug: string,
  organizationId: string
): Effect.Effect<CaseRecord, DomainTag> {
  return Effect.gen(function* getCaseBySlugGen() {
    const normalizedSlug = slugifyName(slug);
    if (normalizedSlug === "") {
      return yield* new NotFoundError({ entity: "Case", id: slug });
    }
    const row = yield* tryDb(() =>
      casesRepo.getBySlug(db, normalizedSlug, organizationId)
    );
    if (!row) {
      return yield* new NotFoundError({ entity: "Case", id: slug });
    }
    return toRecord(row);
  });
}

export function createCaseEffect(
  input: CreateCaseInput
): Effect.Effect<CaseRecord, DomainTag> {
  return Effect.gen(function* createCaseGen() {
    const name = trimmedOrUndefined(input.name);
    if (name === undefined) {
      return yield* new InvalidError({ reason: "Case name is required" });
    }
    const slug =
      input.slug !== undefined && trimmedOrUndefined(input.slug) !== undefined
        ? slugifyName(input.slug)
        : slugForCaseName(name);
    if (slug === "") {
      return yield* new InvalidError({
        reason: "Name must contain letters or numbers",
      });
    }

    const conflictReason = `Slug "${slug}" already exists`;
    const existing = yield* tryDb(() =>
      casesRepo.getBySlug(db, slug, input.organizationId)
    );
    if (existing) {
      return yield* new ConflictError({ reason: conflictReason });
    }
    const created = yield* tryDb(
      () =>
        casesRepo.create(db, {
          name,
          slug,
          description: trimmedOrNull(input.description),
          organizationId: input.organizationId,
        }),
      { uniqueIndex: SLUG_UNIQUE_INDEX, conflictReason }
    );
    if (!created) {
      return yield* new InternalError({ reason: "Failed to create Case" });
    }
    return toRecord(created);
  });
}

export function updateCaseEffect(input: {
  id: string;
  organizationId: string;
  name?: string;
  description?: string | null;
  allowThirdPartyEgress?: boolean;
}): Effect.Effect<CaseRecord, DomainTag> {
  return Effect.gen(function* updateCaseGen() {
    const caseId = yield* requireTrimmedGraphId(input.id, "Case");
    const existing = yield* tryDb(() =>
      casesRepo.getById(db, caseId, input.organizationId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }

    let nextSlug: string | undefined;
    let nextName: string | undefined;
    if (input.name !== undefined) {
      const name = trimmedOrUndefined(input.name);
      if (name === undefined) {
        return yield* new InvalidError({ reason: "Case name is required" });
      }
      nextName = name;
      const slug = slugForCaseName(name);
      if (slug === "") {
        return yield* new InvalidError({
          reason: "Name must contain letters or numbers",
        });
      }
      if (slug !== existing.slug) {
        const taken = yield* tryDb(() =>
          casesRepo.getBySlug(db, slug, input.organizationId)
        );
        if (taken !== null && taken.id !== existing.id) {
          return yield* new ConflictError({
            reason: `Slug "${slug}" already exists`,
          });
        }
        nextSlug = slug;
      }
    }

    const conflictReason =
      nextSlug === undefined
        ? `Slug conflict`
        : `Slug "${nextSlug}" already exists`;
    const updated = yield* tryDb(
      () =>
        casesRepo.update(db, caseId, input.organizationId, {
          ...(nextName === undefined ? {} : { name: nextName }),
          ...(nextSlug === undefined ? {} : { slug: nextSlug }),
          ...(input.description === undefined
            ? {}
            : { description: trimmedOrNull(input.description) }),
          ...(input.allowThirdPartyEgress === undefined
            ? {}
            : { allowThirdPartyEgress: input.allowThirdPartyEgress }),
        }),
      { uniqueIndex: SLUG_UNIQUE_INDEX, conflictReason }
    );

    if (!updated) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }

    if (nextSlug !== undefined) {
      yield* renameCaseExportDirEffect(
        input.organizationId,
        existing.slug,
        nextSlug
      ).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            logSwallowed("rename-case-export", error, {
              from: existing.slug,
              to: nextSlug,
            });
          })
        )
      );
      yield* scheduleCaseExportEffect(caseId).pipe(
        Effect.forkDetach({ startImmediately: true })
      );
    }

    return toRecord(updated);
  });
}

export function deleteCaseEffect(
  id: string,
  opts: { actorId?: string; organizationId: string }
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteCaseGen() {
    const caseId = yield* requireTrimmedGraphId(id, "Case");
    const existing = yield* tryDb(() =>
      casesRepo.getById(db, caseId, opts.organizationId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }

    const deleted = yield* tryDb(() =>
      casesRepo.delete(db, caseId, opts.organizationId)
    );
    if (!deleted) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }
    const logActorId = optionalActorId(opts?.actorId);
    if (logActorId) {
      logProcess("case.delete", "Case deleted", {
        caseId,
        actorId: logActorId,
      });
    }
    yield* notifyEntityChangedEffect(caseId);

    yield* deleteCaseArtifactsEffect(caseId).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          logSwallowed("delete-case-artifacts", error, { caseId });
        })
      )
    );
    yield* removeCaseExportDirEffect(opts.organizationId, existing.slug).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          logSwallowed("delete-case-export", error, { slug: existing.slug });
        })
      )
    );
  });
}

/**
 * Delete every Case in an organization, one at a time, through the normal Case delete
 * (graph rows cascade; artifacts and the Export shadow dir are removed). Used before an
 * organization itself is deleted, so nothing is orphaned. Stops at the first failure.
 */
export function deleteOrganizationCasesEffect(
  organizationId: string,
  opts?: { actorId?: string }
): Effect.Effect<number, DomainTag> {
  return Effect.gen(function* deleteOrganizationCasesGen() {
    const ids = yield* tryDb(() => casesRepo.listIds(db, organizationId));
    for (const id of ids) {
      yield* deleteCaseEffect(id, {
        organizationId,
        ...(opts?.actorId === undefined ? {} : { actorId: opts.actorId }),
      });
    }
    return ids.length;
  });
}
