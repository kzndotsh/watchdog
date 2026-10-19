import { Effect } from "effect";

import { organizationSettingsRepo } from "@watchdog/db";
import { canManageTeam, type OrganizationId } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import { ForbiddenError, type DomainTag } from "../infra/tagged-errors";

/**
 * Whether the caller is an owner or admin of the organization: their Better Auth role, read
 * from the member table. A member, a user outside the organization and a caller with no user id
 * are not.
 */
export function isOrganizationManagerEffect(opts: {
  organizationId: OrganizationId;
  actorId: string | undefined;
}): Effect.Effect<boolean, DomainTag, Db> {
  return Effect.gen(function* isOrganizationManagerGen() {
    const actorId = opts.actorId;
    if (actorId === undefined) return false;
    const role = yield* tryDbWith((exec) =>
      organizationSettingsRepo.memberRole(exec, opts.organizationId, actorId)
    );
    return role !== undefined && canManageTeam(role);
  });
}

/**
 * The one owner-or-admin gate (team management, organization settings, Case delete, restore and
 * purge, a Case's egress switch): `forbidden` with `reason` unless
 * {@link isOrganizationManagerEffect}. An API key acts as its user, so its owner's role decides;
 * the endpoints that must stay session-only refuse the key in the API layer before they get here.
 */
export function requireOrganizationManagerEffect(opts: {
  organizationId: OrganizationId;
  actorId: string | undefined;
  reason: string;
}): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* requireOrganizationManagerGen() {
    const isManager = yield* isOrganizationManagerEffect(opts);
    if (!isManager) {
      return yield* new ForbiddenError({ reason: opts.reason });
    }
  });
}
