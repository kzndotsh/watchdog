import { Effect } from "effect";

import type { OrganizationId } from "@watchdog/schemas/shared";

import { breachCapsMode } from "../caps/breach-caps";
import type { Db } from "../infra/db-service";
import { InvalidError, type DomainTag } from "../infra/tagged-errors";
import { requireOrganizationManagerEffect } from "../organization/roles";

/** What a refused opt-in says: fixed, naming the rule and not the caller. */
const BREACH_CREDENTIAL_OPT_IN_REFUSED =
  "Only a signed-in owner or admin can include breach credentials in an Export";

/** The refusal outside `full` mode: there is nothing to include. */
const BREACH_CREDENTIALS_NOT_AVAILABLE =
  "Breach credentials can only be included in an Export while WD_BREACH_CAPS=full";

/**
 * The one gate on the per-Export opt-in for breach credentials. Two checks, in this order:
 *
 * 1. `forbidden` unless the caller is a signed-in owner or admin of the organization. An API key
 *    never opts in, whatever its scopes or its owner's role (`viaApiKey`); a member, a user
 *    outside the organization and a caller with no user id are refused the same way. This runs
 *    first, so a caller who may not opt in learns nothing about the instance's mode.
 * 2. `invalid` unless the instance runs in `full` mode. In `safe` mode (and `off`) the opt-in is
 *    refused, not ignored: a request for credentials must never look like it succeeded.
 *
 * The streamed download and the export Job start both call this, so no path reaches the archive
 * builder with the flag set without it.
 */
export function requireBreachCredentialOptInEffect(opts: {
  organizationId: OrganizationId;
  actorId: string | undefined;
  viaApiKey: boolean;
}): Effect.Effect<void, DomainTag, Db> {
  return requireOrganizationManagerEffect({
    organizationId: opts.organizationId,
    actorId: opts.viaApiKey ? undefined : opts.actorId,
    reason: BREACH_CREDENTIAL_OPT_IN_REFUSED,
  }).pipe(
    Effect.andThen(
      breachCapsMode() === "full"
        ? Effect.void
        : Effect.fail(
            new InvalidError({ reason: BREACH_CREDENTIALS_NOT_AVAILABLE })
          )
    )
  );
}
