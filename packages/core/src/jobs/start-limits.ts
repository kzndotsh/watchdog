import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";
import type {
  JobStartLimitScope,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { JobStartLimitError, type DomainTag } from "../errors/tagged-errors";
import {
  jobStartCountersRepoFx,
  jobStartLimitsRepoFx,
} from "../infra/repos-fx";
import { jobStartLimitSettings } from "../organization/job-start-limits";

export type JobStartCaller = {
  readonly organizationId: OrganizationId;
  /** The API key that makes the start; a session has none and counts against its organization only. */
  readonly actorKeyId?: string | null | undefined;
};

function refuse(
  scope: JobStartLimitScope,
  limit: number,
  windowSeconds: number,
  retryAfterSeconds: number
) {
  return new JobStartLimitError({
    scope,
    limit,
    windowSeconds,
    retryAfterSeconds,
  });
}

/**
 * Count one Job start for the caller's organization and, for a key, the key, in the current
 * window; fail with `JobStartLimitError` when either is full. Every path that creates a Job row
 * for a person's request calls it on the creating transaction, so:
 *
 * - concurrent starts are exact (`jobStartCountersRepo.take` is one atomic upsert under the
 *   counter row's lock), whatever number of web processes there are;
 * - a refused start rolls the whole creation back, including the organization's count when only
 *   the key was over;
 * - a start that fails for another reason after the count rolls back with it.
 *
 * Call it as the LAST step before commit, after every row lock the path takes (the Case, the
 * Playbook run): the counter row is held until commit, so taking it last keeps a lock order no two
 * starts can invert. The organization counter is always taken before the key's.
 */
export function takeJobStartEffect(
  tx: DbExec,
  caller: JobStartCaller
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* takeJobStartGen() {
    const settings = jobStartLimitSettings();
    const keyId = caller.actorKeyId ?? undefined;
    const overrides = yield* jobStartLimitsRepoFx.forStart(
      tx,
      caller.organizationId,
      keyId
    );
    const organizationLimit =
      overrides.organization ?? settings.organizationLimit;
    const organization = yield* jobStartCountersRepoFx.take(tx, {
      scope: "organization",
      subjectId: caller.organizationId,
      limit: organizationLimit,
      windowSeconds: settings.windowSeconds,
    });
    if (!organization.admitted) {
      return yield* refuse(
        "organization",
        organizationLimit,
        settings.windowSeconds,
        organization.retryAfterSeconds
      );
    }
    if (keyId === undefined) return;
    const keyLimit = overrides.key ?? settings.keyLimit;
    const key = yield* jobStartCountersRepoFx.take(tx, {
      scope: "key",
      subjectId: keyId,
      limit: keyLimit,
      windowSeconds: settings.windowSeconds,
    });
    if (!key.admitted) {
      return yield* refuse(
        "key",
        keyLimit,
        settings.windowSeconds,
        key.retryAfterSeconds
      );
    }
  });
}
