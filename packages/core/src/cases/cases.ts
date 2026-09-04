import { Effect } from "effect";

import { casesRepo, db, type CaseRow } from "@watchdog/db";
import { slugifyName } from "@watchdog/schemas";

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
  slug: string;
  description?: string;
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

export function listCasesEffect(): Effect.Effect<CaseRecord[], DomainTag> {
  return tryDb(() => casesRepo.list(db)).pipe(
    Effect.map((rows) => rows.map(toRecord))
  );
}

export function getCaseByIdEffect(
  id: string
): Effect.Effect<CaseRecord, DomainTag> {
  return tryDb(() => casesRepo.getById(db, id)).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(toRecord(row))
        : new NotFoundError({ resource: "Case not found" })
    )
  );
}

export function getCaseBySlugEffect(
  slug: string
): Effect.Effect<CaseRecord, DomainTag> {
  return tryDb(() => casesRepo.getBySlug(db, slug)).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(toRecord(row))
        : new NotFoundError({ resource: "Case not found" })
    )
  );
}

export function createCaseEffect(
  input: CreateCaseInput
): Effect.Effect<CaseRecord, DomainTag> {
  const conflictReason = `Slug "${input.slug}" already exists`;
  return Effect.gen(function* createCaseGen() {
    const existing = yield* tryDb(() => casesRepo.getBySlug(db, input.slug));
    if (existing) {
      return yield* new ConflictError({ reason: conflictReason });
    }
    const created = yield* tryDb(
      () =>
        casesRepo.create(db, {
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
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
  name?: string;
  description?: string;
  allowThirdPartyEgress?: boolean;
}): Effect.Effect<CaseRecord, DomainTag> {
  return Effect.gen(function* updateCaseGen() {
    const existing = yield* tryDb(() => casesRepo.getById(db, input.id));
    if (!existing) {
      return yield* new NotFoundError({ resource: "Case not found" });
    }

    let nextSlug: string | undefined;
    if (input.name !== undefined) {
      const slug = slugForCaseName(input.name);
      if (slug === "") {
        return yield* new InvalidError({
          reason: "Name must contain letters or numbers",
        });
      }
      if (slug !== existing.slug) {
        const taken = yield* tryDb(() => casesRepo.getBySlug(db, slug));
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
        casesRepo.update(db, input.id, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(nextSlug === undefined ? {} : { slug: nextSlug }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
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
      yield* scheduleCaseExportEffect(input.id).pipe(
        Effect.forkDetach({ startImmediately: true })
      );
    }

    return toRecord(updated);
  });
}

export function deleteCaseEffect(
  id: string,
  opts?: { actorId?: string }
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteCaseGen() {
    const existing = yield* tryDb(() => casesRepo.getById(db, id));
    if (!existing) {
      return yield* new NotFoundError({ resource: "Case not found" });
    }

    const deleted = yield* tryDb(() => casesRepo.delete(db, id));
    if (!deleted) {
      return yield* new InvalidError({ reason: "Failed to delete Case" });
    }
    if (opts?.actorId) {
      logProcess("case.delete", "Case deleted", {
        caseId: id,
        actorId: opts.actorId,
      });
    }
    yield* notifyEntityChangedEffect(id);

    yield* deleteCaseArtifactsEffect(id).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          logSwallowed("delete-case-artifacts", error, { caseId: id });
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
