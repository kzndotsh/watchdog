import { Effect, Result } from "effect";

import { parseTrimmedUuid } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import {
  caseOrganizationUncheckedEffect,
  inOrganization,
} from "../infra/organization-scope";
import { jobsRepoFxDb } from "../infra/repos-fx";

/**
 * Run `effect` in the organization of the Job's Case (row-level security, #718). The worker holds
 * a Job id and no organization: it reads the Job (Jobs carry no policy) and its Case's
 * organization past the policies (`caseOrganizationUncheckedEffect`, a trusted path). A Job or
 * Case that is gone, or a lookup that fails, runs unscoped: the preflight then reads no Case and
 * stops the attempt, as it would have without the scope. `effect`'s own failures pass through
 * unchanged; failing to set the scope on a provided transaction (tests) is a broken connection,
 * a defect like the driver errors around it.
 */
export function inJobOrganization<A, E, R>(
  jobId: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | Db> {
  return Effect.gen(function* inJobOrganizationGen() {
    // Not a Job id: nothing to look up (the preflight stops it without a query).
    if (parseTrimmedUuid(jobId) === null) return yield* effect;
    const job = yield* jobsRepoFxDb
      .get(jobId)
      .pipe(Effect.orElseSucceed(() => null));
    if (job === null) return yield* effect;
    const organizationId = yield* caseOrganizationUncheckedEffect(
      job.caseId
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
