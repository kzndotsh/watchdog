import { Effect } from "effect";

import { casesRepo } from "@watchdog/db";
import {
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
  type CaseId,
  type OrganizationId,
  type Page,
} from "@watchdog/schemas/shared";

import {
  appendGraphActivityEffect,
  graphActorFields,
  type GraphActor,
} from "../graph/graph-activity";
import { requireTrimmedCaseIdEffect } from "../graph/patch/guards";
import type { Db } from "../infra/db-service";
import {
  renameCaseExportDirEffect,
  scheduleCaseExportEffect,
} from "../infra/export-sync";
import { pageWindow, toPage } from "../infra/page";
import type { PageRequest } from "../infra/page";
import { tryDb, tryDbWith, requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { logSwallowed } from "../infra/process-log";
import {
  boundEchoedId,
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { requireOrganizationManagerEffect } from "../organization/roles";
import { toRecord, type CaseRecord } from "./case-record";

export type { CaseRecord } from "./case-record";

const SLUG_UNIQUE_INDEX = "cases_organization_id_slug_uidx";

export type CreateCaseInput = {
  name: string;
  slug?: string;
  description?: string;
  organizationId: OrganizationId;
};

/** Derive the Case URL slug from a display name. Empty if unsugifiable. */
export function slugForCaseName(name: string): string {
  return slugifyName(name);
}

/** Reference for the `Db` service pattern (ADR-0002 phase 2): R = `Db`, client from `tryDbWith`. */
export function listCasesEffect(
  organizationId: OrganizationId,
  page: PageRequest = {}
): Effect.Effect<Page<CaseRecord>, DomainTag, Db> {
  return Effect.gen(function* listCasesGen() {
    const window = yield* pageWindow(page, 1);
    const rows = yield* tryDbWith((exec) =>
      casesRepo.list(exec, organizationId, {
        limit: window.limit + 1,
        ...(window.after === undefined ? {} : { after: window.after }),
      })
    );
    return toPage(rows, window, toRecord, (row) => ({
      id: row.id,
      values: [row.name],
    }));
  });
}

/** The Cases an organization can see and which one is Active for a stored selection. */
export type ActiveCaseContext = {
  cases: CaseRecord[];
  active: CaseRecord | null;
};

/**
 * The one Active-Case rule. The stored selection (the web cookie) stays Active only while
 * it names a Case this organization can see; a deleted, invalid or foreign id heals to the
 * first visible Case, and an organization with no Cases has none. The Case list is read
 * with the same organization scope as `listCasesEffect` (all of it, not a page: the shell needs every Case), so another organization's Case
 * is never returned as `active`.
 */
export function resolveActiveCaseEffect(
  organizationId: OrganizationId,
  stored: CaseId | null
): Effect.Effect<ActiveCaseContext, DomainTag, Db> {
  return tryDbWith((exec) => casesRepo.list(exec, organizationId)).pipe(
    Effect.map((rows) => rows.map(toRecord)),
    Effect.map((cases) => ({
      cases,
      active:
        (stored === null
          ? undefined
          : cases.find((row) => row.id === stored)) ??
        cases[0] ??
        null,
    }))
  );
}

/**
 * Ids of every Case the organization can see. The live events stream filters
 * NOTIFY payloads against this set, so Case visibility is decided here, with the
 * same organization scope as every other Case read.
 */
export function listVisibleCaseIdsEffect(
  organizationId: OrganizationId
): Effect.Effect<string[], DomainTag, Db> {
  return tryDbWith((exec) => casesRepo.listIds(exec, organizationId));
}

export function getCaseByIdEffect(
  id: CaseId,
  organizationId: OrganizationId
): Effect.Effect<CaseRecord, DomainTag, Db> {
  return Effect.gen(function* getCaseByIdGen() {
    const caseId = yield* requireTrimmedCaseIdEffect(id);
    const row = yield* tryDbWith((exec) =>
      casesRepo.getById(exec, caseId, organizationId)
    );
    if (!row) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }
    return toRecord(row);
  });
}

export function getCaseBySlugEffect(
  slug: string,
  organizationId: OrganizationId
): Effect.Effect<CaseRecord, DomainTag, Db> {
  return Effect.gen(function* getCaseBySlugGen() {
    const normalizedSlug = slugifyName(slug);
    if (normalizedSlug === "") {
      return yield* new NotFoundError({
        entity: "Case",
        id: boundEchoedId(slug),
      });
    }
    const row = yield* tryDbWith((exec) =>
      casesRepo.getBySlug(exec, normalizedSlug, organizationId)
    );
    if (!row) {
      return yield* new NotFoundError({
        entity: "Case",
        id: boundEchoedId(slug),
      });
    }
    return toRecord(row);
  });
}

export function createCaseEffect(
  input: CreateCaseInput
): Effect.Effect<CaseRecord, DomainTag, Db> {
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
    const existing = yield* tryDbWith((exec) =>
      casesRepo.getBySlug(exec, slug, input.organizationId)
    );
    if (existing) {
      return yield* new ConflictError({ reason: conflictReason });
    }
    const created = yield* tryDbWith(
      (exec) =>
        casesRepo.create(exec, {
          name,
          slug,
          description: trimmedOrNull(input.description),
          organizationId: input.organizationId,
        }),
      { uniqueIndex: SLUG_UNIQUE_INDEX, conflictReason }
    ).pipe(requireWritten("create Case"));
    return toRecord(created);
  });
}

export function updateCaseEffect(
  input: {
    id: CaseId;
    organizationId: OrganizationId;
    name?: string;
    description?: string | null;
    allowThirdPartyEgress?: boolean;
  } & GraphActor
): Effect.Effect<CaseRecord, DomainTag, Db> {
  return Effect.gen(function* updateCaseGen() {
    const caseId = yield* requireTrimmedCaseIdEffect(input.id);
    const existing = yield* tryDbWith((exec) =>
      casesRepo.getById(exec, caseId, input.organizationId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }

    // Third-party egress sends Case data to outside services: an owner or admin decides.
    if (input.allowThirdPartyEgress !== undefined) {
      yield* requireOrganizationManagerEffect({
        organizationId: input.organizationId,
        actorId: input.actorId,
        reason: "Only an owner or admin can change a Case's third-party egress",
      });
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
        const taken = yield* tryDbWith((exec) =>
          casesRepo.getBySlug(exec, slug, input.organizationId)
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
    const updated = yield* transact(
      (tx) =>
        Effect.gen(function* updateCaseTx() {
          const row = yield* tryDb(() =>
            casesRepo.update(tx, caseId, input.organizationId, {
              ...(nextName === undefined ? {} : { name: nextName }),
              ...(nextSlug === undefined ? {} : { slug: nextSlug }),
              ...(input.description === undefined
                ? {}
                : { description: trimmedOrNull(input.description) }),
              ...(input.allowThirdPartyEgress === undefined
                ? {}
                : { allowThirdPartyEgress: input.allowThirdPartyEgress }),
            })
          );
          if (!row) {
            return yield* new NotFoundError({ entity: "Case", id: caseId });
          }
          yield* appendGraphActivityEffect(tx, {
            ...graphActorFields(input),
            caseId,
            kind: "case",
            action: "updated",
            subjectId: row.id,
            label: row.name,
          });
          return row;
        }),
      { uniqueIndex: SLUG_UNIQUE_INDEX, conflictReason }
    );

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
