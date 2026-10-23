import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";
import { env } from "@watchdog/env/server";
import type {
  JobStartLimitScope,
  OrganizationId,
} from "@watchdog/schemas/shared";

import {
  jobStartCountersRepoFx,
  jobStartLimitsRepoFx,
} from "../infra/repos-fx";
import { JobStartLimitError, type DomainTag } from "../infra/tagged-errors";

/** The defaults of `WD_JOB_START_*`, for a process where `env` is not validated (lint, unit tests). */
const DEFAULT_WINDOW_SECONDS = 3600;
const DEFAULT_ORGANIZATION_LIMIT = 600;
const DEFAULT_KEY_LIMIT = 120;

/** What Job start limiting reads from configuration (`WD_JOB_START_*`). */
export type JobStartLimitSettings = {
  /** Length of the fixed counting window, in seconds. */
  readonly windowSeconds: number;
  /** Instance default: starts per window for an organization with no override. */
  readonly organizationLimit: number;
  /** Instance default: starts per window for an API key with no override. */
  readonly keyLimit: number;
};

/** Read at call time, so every web process and the worker agree. */
export function jobStartLimitSettings(): JobStartLimitSettings {
  const windowSeconds: number | undefined = env.WD_JOB_START_WINDOW_SECONDS;
  const organizationLimit: number | undefined = env.WD_JOB_START_LIMIT_ORG;
  const keyLimit: number | undefined = env.WD_JOB_START_LIMIT_KEY;
  return {
    windowSeconds: windowSeconds ?? DEFAULT_WINDOW_SECONDS,
    organizationLimit: organizationLimit ?? DEFAULT_ORGANIZATION_LIMIT,
    keyLimit: keyLimit ?? DEFAULT_KEY_LIMIT,
  };
}

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
