import { Effect } from "effect";

import { caseListRepo, casesRepo } from "@watchdog/db";
import { normalizeAllowedEgress } from "@watchdog/schemas/caps";
import { caseList } from "@watchdog/schemas/cases";
import {
  PAGE_LIMIT_DEFAULT,
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
  type CaseId,
  type EgressClass,
  type OrganizationId,
  type GraphActor,
  type ListInput,
  type ListPage,
} from "@watchdog/schemas/shared";

import {
  appendGraphActivityEffect,
  graphActorFields,
} from "../activity/graph-activity";
import {
  boundEchoedId,
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../errors/tagged-errors";
import type { Db } from "../infra/db-service";
import { listPageEffect } from "../infra/list-page";
import { inOrganization } from "../infra/organization-scope";
import { tryDbWith, requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { casesRepoFxDb, casesRepoFx } from "../infra/repos-fx";
import { requireOrganizationManagerEffect } from "../organization/roles";
import { requireTrimmedCaseIdEffect } from "./access";
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

/**
 * One page of the organization's Case list (`caseList`, ADR-0007): the declared filter, `q` and
 * sort, keyset paged, with `total` on the first page. Without `input` it is the first page of the
 * default view (by name). The organization is the caller's: it is the list's `context`, never a
 * request param.
 */
export function listCasesEffect(
  organizationId: OrganizationId,
  input?: ListInput<typeof caseList>
): Effect.Effect<ListPage<CaseRecord>, DomainTag, Db> {
  return inOrganization(
    organizationId,
    listPageEffect({
      def: caseList,
      repo: caseListRepo,
      scope: { organizationId },
      input: input ?? { limit: PAGE_LIMIT_DEFAULT },
      toItems: (rows) => Effect.succeed(rows.map(toRecord)),
    })
  );
}

/**
 * Ids of every Case the organization can see. The live events stream filters
 * NOTIFY payloads against this set, so Case visibility is decided here, with the
 * same organization scope as every other Case read.
 *
 * @canonical `listVisibleCaseIdsEffect`: Case ids visible to an org
 */
export function listVisibleCaseIdsEffect(
  organizationId: OrganizationId
): Effect.Effect<string[], DomainTag, Db> {
  return inOrganization(organizationId, casesRepoFxDb.listIds(organizationId));
}

export function getCaseByIdEffect(
  id: CaseId,
  organizationId: OrganizationId
): Effect.Effect<CaseRecord, DomainTag, Db> {
  const program = Effect.gen(function* getCaseByIdGen() {
    const caseId = yield* requireTrimmedCaseIdEffect(id);
    const row = yield* casesRepoFxDb.getById(caseId, organizationId);
    if (!row) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }
    return toRecord(row);
  });
  return inOrganization(organizationId, program);
}

export function getCaseBySlugEffect(
  slug: string,
  organizationId: OrganizationId
): Effect.Effect<CaseRecord, DomainTag, Db> {
  const program = Effect.gen(function* getCaseBySlugGen() {
    const normalizedSlug = slugifyName(slug);
    if (normalizedSlug === "") {
      return yield* new NotFoundError({
        entity: "Case",
        id: boundEchoedId(slug),
      });
    }
    const row = yield* casesRepoFxDb.getBySlug(normalizedSlug, organizationId);
    if (!row) {
      return yield* new NotFoundError({
        entity: "Case",
        id: boundEchoedId(slug),
      });
    }
    return toRecord(row);
  });
  return inOrganization(organizationId, program);
}

export function createCaseEffect(
  input: CreateCaseInput
): Effect.Effect<CaseRecord, DomainTag, Db> {
  const program = Effect.gen(function* createCaseGen() {
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
    const existing = yield* casesRepoFxDb.getBySlug(slug, input.organizationId);
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
  return inOrganization(input.organizationId, program);
}

/** The update, and the slug the Case had when it changed (`undefined` when the slug is unchanged), for the caller that keeps the disk Export in step. */
export function updateCaseWithPreviousSlugEffect(
  input: {
    id: CaseId;
    organizationId: OrganizationId;
    name?: string;
    description?: string | null;
    allowedEgress?: readonly EgressClass[];
  } & GraphActor
): Effect.Effect<
  { record: CaseRecord; previousSlug: string | undefined },
  DomainTag,
  Db
> {
  const program = Effect.gen(function* updateCaseGen() {
    const caseId = yield* requireTrimmedCaseIdEffect(input.id);
    const existing = yield* casesRepoFxDb.getById(caseId, input.organizationId);
    if (!existing) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }

    // Which egress classes a Case allows decides where its data can go: an owner or admin decides.
    if (input.allowedEgress !== undefined) {
      yield* requireOrganizationManagerEffect({
        organizationId: input.organizationId,
        actorId: input.actorId,
        reason: "Only an owner or admin can change which egress a Case allows",
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
        const taken = yield* casesRepoFxDb.getBySlug(
          slug,
          input.organizationId
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
          const row = yield* casesRepoFx.update(
            tx,
            caseId,
            input.organizationId,
            {
              ...(nextName === undefined ? {} : { name: nextName }),
              ...(nextSlug === undefined ? {} : { slug: nextSlug }),
              ...(input.description === undefined
                ? {}
                : { description: trimmedOrNull(input.description) }),
              ...(input.allowedEgress === undefined
                ? {}
                : {
                    allowedEgress: normalizeAllowedEgress(input.allowedEgress),
                  }),
            }
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

    return {
      record: toRecord(updated),
      previousSlug: nextSlug === undefined ? undefined : existing.slug,
    };
  });
  return inOrganization(input.organizationId, program);
}
