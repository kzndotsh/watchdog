import { Effect } from "effect";

import { casesRepo, db, type CaseRow } from "@watchdog/db";
import {
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import { optionalActorId } from "../actors/require-actor-id";
import { requireTrimmedGraphId } from "../graph/patch/guards";
import { deleteCaseArtifactsEffect } from "../infra/blob";
import { notifyEntityChangedEffect } from "../infra/events";
import {
  removeCaseExportDirEffect,
  renameCaseExportDirEffect,
  scheduleCaseExportEffect,
} from "../infra/export-sync";
import { tryDb } from "../infra/postgres-effect";
import { logProcess, logSwallowed } from "../infra/process-log";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";

const SLUG_UNIQUE_INDEX = "cases_slug_unique";

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

export function listCasesEffect(
  organizationId: string
): Effect.Effect<CaseRecord[], DomainTag> {
  return tryDb(() => casesRepo.list(db, organizationId)).pipe(
    Effect.map((rows) => rows.map(toRecord))
  );
}

export function getCaseByIdEffect(
  id: string,
  organizationId: string
): Effect.Effect<CaseRecord, DomainTag> {
  return Effect.gen(function* getCaseByIdGen() {
    const caseId = yield* requireTrimmedGraphId(id, "Case not found");
    const row = yield* tryDb(() =>
      casesRepo.getById(db, caseId, organizationId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Case not found" });
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
      return yield* new NotFoundError({ resource: "Case not found" });
    }
    const row = yield* tryDb(() =>
      casesRepo.getBySlug(db, normalizedSlug, organizationId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Case not found" });
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
    const existing = yield* tryDb(() => casesRepo.getBySlugUnchecked(db, slug));
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
      return yield* new InvalidError({ reason: "Failed to create Case" });
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
    const caseId = yield* requireTrimmedGraphId(input.id, "Case not found");
    const existing = yield* tryDb(() =>
      casesRepo.getById(db, caseId, input.organizationId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Case not found" });
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
          casesRepo.getBySlugUnchecked(db, slug)
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
      return yield* new NotFoundError({ resource: "Case not found" });
    }

    if (nextSlug !== undefined) {
      yield* renameCaseExportDirEffect(existing.slug, nextSlug).pipe(
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
    const caseId = yield* requireTrimmedGraphId(id, "Case not found");
    const existing = yield* tryDb(() =>
      casesRepo.getById(db, caseId, opts.organizationId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Case not found" });
    }

    const deleted = yield* tryDb(() =>
      casesRepo.delete(db, caseId, opts.organizationId)
    );
    if (!deleted) {
      return yield* new InvalidError({ reason: "Failed to delete Case" });
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
    yield* removeCaseExportDirEffect(existing.slug).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          logSwallowed("delete-case-export", error, { slug: existing.slug });
        })
      )
    );
  });
}
