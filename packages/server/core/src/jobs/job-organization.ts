import { Effect, Result } from "effect";

import { jobOrganizationIdUnchecked } from "#db";
import { parseTrimmedUuid } from "@watchdog/domain/schemas/shared";

import { Db } from "../infra/db-service";
import { inOrganization } from "../infra/organization-scope";
import { tryDb } from "../infra/postgres-effect";

/**
 * Run `effect` in the organization of the Job's Case (row-level security, #718, #719). The worker
 * holds a Job id and no organization: it reads the Job's organization past the policies
 * (`jobOrganizationIdUnchecked`, a trusted path; the policy on `jobs` hides the row until an
 * organization is set). A Job that is gone, or a lookup that fails, runs unscoped: the preflight
 * then reads no Job and no Case and stops the attempt, as it would have without the scope.
 * `effect`'s own failures pass through unchanged; failing to set the scope on a provided
 * transaction (tests) is a broken connection, a defect like the driver errors around it.
 */
export function inJobOrganization<A, E, R>(
  jobId: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | Db> {
  return Effect.gen(function* inJobOrganizationGen() {
    // Not a Job id: nothing to look up (the preflight stops it without a query).
    if (parseTrimmedUuid(jobId) === null) return yield* effect;
    const exec = yield* Db;
    const organizationId = yield* tryDb(() =>
      jobOrganizationIdUnchecked(exec, jobId)
    ).pipe(Effect.orElseSucceed(() => null));
    if (organizationId === null) return yield* effect;
    const outcome = yield* inOrganization(
      organizationId,
      Effect.result(effect)
    ).pipe(Effect.orDie);
    if (Result.isFailure(outcome)) return yield* Effect.fail(outcome.failure);
    return outcome.success;
  });
}
