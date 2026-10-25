import type { Effect } from "effect";

import type { OrganizationId } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import type { DomainTag } from "../infra/tagged-errors";
import { requireOrganizationManagerEffect } from "../organization/roles";

/** What a refused opt-in says: fixed, naming the rule and not the caller. */
export const RAW_BODY_OPT_IN_REFUSED =
  "Only a signed-in owner or admin can include raw provider responses in an Export";

/**
 * The one gate on the per-Export opt-in for raw provider responses: `forbidden` unless the
 * caller is a signed-in owner or admin of the organization. An API key never opts in, whatever
 * its scopes or its owner's role (`viaApiKey`); a member, a user outside the organization and a
 * caller with no user id are refused the same way. Both the streamed download and the export Job
 * start call this, so no path reaches the archive builder with the flag set without it.
 */
export function requireRawBodyOptInEffect(opts: {
  organizationId: OrganizationId;
  actorId: string | undefined;
  viaApiKey: boolean;
}): Effect.Effect<void, DomainTag, Db> {
  return requireOrganizationManagerEffect({
    organizationId: opts.organizationId,
    actorId: opts.viaApiKey ? undefined : opts.actorId,
    reason: RAW_BODY_OPT_IN_REFUSED,
  });
}
