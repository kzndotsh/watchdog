import { Effect } from "effect";

import {
  caseOrganizationIdUnchecked,
  isOrganizationScoped,
  isTransaction,
  listOrganizationIds,
  organizationScopedDb,
  setOrganizationContext,
  setWorkerRole,
  workerRoleDb,
} from "@watchdog/db";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import { NotFoundError, type DomainTag } from "../errors/tagged-errors";
import { Db } from "./db-service";
import { tryDb } from "./postgres-effect";

/**
 * Run `effect` with the `Db` service scoped to `organizationId` (row-level security, #718): every
 * statement and transaction it runs on the service sets `watchdog.org_id` first, so the policies on
 * every Case-scoped table show that organization's rows and no other's. A `Db` that is itself a
 * transaction (a test's `Db.layerOf(tx)`) gets the setting for the rest of that transaction.
 *
 * The one way core code gains an organization scope: every exported Effect that takes an
 * `organizationId` runs its body in it, so callers (procedures, routes, tests) change nothing,
 * and a path that forgets reads no Case at all (fail closed) instead of another organization's.
 * Scoping again, to the same or another organization, replaces the scope.
 */
export function inOrganization<A, E, R>(
  organizationId: OrganizationId,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | DomainTag, R | Db> {
  return Effect.gen(function* inOrganizationGen() {
    const exec = yield* Db;
    if (isTransaction(exec)) {
      yield* tryDb(() => setOrganizationContext(exec, organizationId));
      return yield* effect;
    }
    return yield* Effect.provideService(
      effect,
      Db,
      organizationScopedDb(exec, organizationId)
    );
  });
}

/**
 * Run `effect` as the worker role (`WORKER_ROLE`, #720): every statement and transaction it runs
 * on the `Db` service switches to the role first, so it may write Evidence, provider calls,
 * Proposals and Jobs and no Graph table (a Graph write fails with `42501`, an `InternalError`).
 * For an API-key request in the web process (`runApp`); the worker needs nothing, it logs in as
 * the role. Composes with `inOrganization` either way round. A `Db` that is itself a transaction
 * (a test's `Db.layerOf(tx)`) switches for the rest of that transaction.
 */
export function inWorkerRole<A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | DomainTag, R | Db> {
  return Effect.gen(function* inWorkerRoleGen() {
    const exec = yield* Db;
    if (isTransaction(exec)) {
      yield* tryDb(() => setWorkerRole(exec));
      return yield* effect;
    }
    return yield* Effect.provideService(effect, Db, workerRoleDb(exec));
  });
}

/**
 * The organization of a Case whose id a trusted path already holds (a Job's, a child row's), read
 * past row-level security. `NotFoundError` for a missing Case. Never for an id a caller sent:
 * caller-facing Effects scope to the caller's organization (`inOrganization`).
 */
export function caseOrganizationUncheckedEffect(
  caseId: CaseId
): Effect.Effect<OrganizationId, DomainTag, Db> {
  return Effect.gen(function* caseOrganizationUncheckedGen() {
    const exec = yield* Db;
    const organizationId = yield* tryDb(() =>
      caseOrganizationIdUnchecked(exec, caseId)
    );
    if (organizationId === null) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }
    return organizationId;
  });
}

/**
 * `inOrganization` for a trusted path that holds a Case id and no organization (the worker's Job
 * run, reconcile, the Case export): scopes to the Case's own organization. A missing Case is
 * `NotFoundError`.
 */
export function inCaseOrganizationUnchecked<A, E, R>(
  caseId: CaseId,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | DomainTag, R | Db> {
  return Effect.gen(function* inCaseOrganizationUncheckedGen() {
    // Already in an organization's scope (a Job run, a request): the Case is read in it, and a
    // Case of another organization is not found, which is the scope working.
    if (isOrganizationScoped(yield* Db)) return yield* effect;
    const organizationId = yield* caseOrganizationUncheckedEffect(caseId);
    return yield* inOrganization(organizationId, effect);
  });
}

/**
 * `inCaseOrganizationUnchecked` for background repair over rows that name a Case (reconcile): a
 * Case that is gone runs `effect` unscoped, where it reads no Case and finds nothing to do, as it
 * would have once the Case's rows cascaded away.
 */
export function inCaseOrganizationIfFound<A, E, R>(
  caseId: CaseId,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | DomainTag, R | Db> {
  return Effect.gen(function* inCaseOrganizationIfFoundGen() {
    const exec = yield* Db;
    // Already in an organization's scope: as in `inCaseOrganizationUnchecked`.
    if (isOrganizationScoped(exec)) return yield* effect;
    const organizationId = yield* tryDb(() =>
      caseOrganizationIdUnchecked(exec, caseId)
    );
    if (organizationId === null) return yield* effect;
    return yield* inOrganization(organizationId, effect);
  });
}

/**
 * Every organization id, for maintenance that visits each organization's Cases in its own scope
 * (`forEachOrganization`).
 */
export function listOrganizationIdsEffect(): Effect.Effect<
  OrganizationId[],
  DomainTag,
  Db
> {
  return Effect.gen(function* listOrganizationIdsGen() {
    const exec = yield* Db;
    return yield* tryDb(() => listOrganizationIds(exec));
  });
}

/**
 * Run `perOrganization` once per organization, each in that organization's scope, in order, and
 * collect the results: maintenance over every Case (the scheduled purge, the export re-scan)
 * without a path past row-level security.
 */
export function forEachOrganization<A, E, R>(
  perOrganization: (organizationId: OrganizationId) => Effect.Effect<A, E, R>
): Effect.Effect<A[], E | DomainTag, R | Db> {
  return Effect.flatMap(listOrganizationIdsEffect(), (organizationIds) =>
    Effect.forEach(
      organizationIds,
      (organizationId) =>
        inOrganization(organizationId, perOrganization(organizationId)),
      { concurrency: 1 }
    )
  );
}
