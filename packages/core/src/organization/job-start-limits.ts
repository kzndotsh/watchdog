import { Effect } from "effect";

import {
  apiKeyOrganizationId,
  isInstanceAdminRole,
  type JobStartLimitState,
  type JobStartLimits,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import {
  jobStartCountersRepoFxDb,
  jobStartLimitsRepoFxDb,
  usersRepoFxDb,
} from "../infra/repos-fx";
import {
  ForbiddenError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { jobStartLimitSettings } from "../jobs/start-limits";
import { isOrganizationManagerEffect } from "./roles";

function limitState(
  override: number | undefined,
  defaultLimit: number,
  used: number
): JobStartLimitState {
  return {
    limit: override ?? defaultLimit,
    used,
    source: override === undefined ? "default" : "override",
    defaultLimit,
  };
}

/**
 * The Job start limits that apply to the caller, with this window's use: the organization's, the
 * calling key's (null for a session) and every key of the organization that has its own limit.
 */
export function getJobStartLimitsEffect(caller: {
  organizationId: OrganizationId;
  actorKeyId?: string | null | undefined;
}): Effect.Effect<JobStartLimits, DomainTag, Db> {
  return Effect.gen(function* getJobStartLimitsGen() {
    const settings = jobStartLimitSettings();
    const { windowSeconds } = settings;
    const rows = yield* jobStartLimitsRepoFxDb.listForOrganization(
      caller.organizationId
    );
    const organizationUsed = yield* jobStartCountersRepoFxDb.used({
      scope: "organization",
      subjectId: caller.organizationId,
      windowSeconds,
    });
    const organization = limitState(
      rows.find((row) => row.keyId === null)?.maxStarts,
      settings.organizationLimit,
      organizationUsed
    );
    const keyId = caller.actorKeyId ?? undefined;
    let key: JobStartLimitState | null = null;
    if (keyId !== undefined) {
      const keyUsed = yield* jobStartCountersRepoFxDb.used({
        scope: "key",
        subjectId: keyId,
        windowSeconds,
      });
      key = limitState(
        rows.find((row) => row.keyId === keyId)?.maxStarts,
        settings.keyLimit,
        keyUsed
      );
    }
    const keyOverrides = rows.flatMap((row) =>
      row.keyId === null ? [] : [{ keyId: row.keyId, limit: row.maxStarts }]
    );
    return { windowSeconds, organization, key, keyOverrides };
  });
}

export type SetJobStartLimitOpts = {
  organizationId: OrganizationId;
  /** The signed-in user changing the limit. */
  actorId: string;
  /** The API key to set the limit for; left out, the organization's own limit. */
  keyId?: string | undefined;
  /** The new limit per window (0 refuses every start); null removes the override. */
  maxStarts: number | null;
};

/**
 * Set, or with `maxStarts` null clear, a Job start limit: the organization's own or one of its
 * API keys'. An instance admin may set any value. An owner or admin of the organization may set
 * a key's limit and lower the organization's, but not raise it above the instance default
 * (`WD_JOB_START_LIMIT_ORG`): the operator's limit protects the provider quotas the whole
 * instance shares. A key that is not in the organization is `not_found`, like a foreign Case.
 */
export function setJobStartLimitEffect(
  opts: SetJobStartLimitOpts
): Effect.Effect<JobStartLimits, DomainTag, Db> {
  return Effect.gen(function* setJobStartLimitGen() {
    const { organizationId, actorId, keyId, maxStarts } = opts;
    const role = yield* usersRepoFxDb.getRole(actorId);
    const instanceAdmin = isInstanceAdminRole(role?.role);
    const manager = yield* isOrganizationManagerEffect({
      organizationId,
      actorId,
    });
    if (!manager && !instanceAdmin) {
      return yield* new ForbiddenError({
        reason: "Only an owner or admin can change Job start limits",
      });
    }
    const { organizationLimit } = jobStartLimitSettings();
    if (
      keyId === undefined &&
      maxStarts !== null &&
      maxStarts > organizationLimit &&
      !instanceAdmin
    ) {
      return yield* new ForbiddenError({
        reason: `Only an instance admin can raise the organization's Job start limit above the instance default (${organizationLimit})`,
      });
    }

    if (keyId === undefined) {
      yield* maxStarts === null
        ? jobStartLimitsRepoFxDb.clearForOrganization(organizationId)
        : jobStartLimitsRepoFxDb.setForOrganization(organizationId, maxStarts);
    } else {
      const key = yield* jobStartLimitsRepoFxDb.keyMetadata(keyId);
      if (
        key === undefined ||
        apiKeyOrganizationId(key.metadata) !== organizationId
      ) {
        return yield* new NotFoundError({ entity: "API key", id: keyId });
      }
      yield* maxStarts === null
        ? jobStartLimitsRepoFxDb.clearForKey(organizationId, keyId)
        : jobStartLimitsRepoFxDb.setForKey(organizationId, keyId, maxStarts);
    }
    return yield* getJobStartLimitsEffect({ organizationId });
  });
}
