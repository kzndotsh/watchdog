import { ORPCError } from "@orpc/server";

import {
  credentialHasScope,
  insufficientScopeData,
  insufficientScopeMessage,
} from "@watchdog/schemas/shared";
import type { ApiCredential, Scope } from "@watchdog/schemas/shared";

/** Throws the oRPC `FORBIDDEN` / `insufficient_scope` error when a key lacks `scope`. */
export function assertScope(credential: ApiCredential, scope: Scope): void {
  if (credentialHasScope(credential, scope)) return;
  throw new ORPCError("FORBIDDEN", {
    defined: true,
    message: insufficientScopeMessage(scope),
    data: insufficientScopeData(scope),
  });
}

/** The refusal for an action only a signed-in person may take (no API key, whatever its scopes). */
export function sessionRequiredError(): ORPCError<"FORBIDDEN", undefined> {
  return new ORPCError("FORBIDDEN", {
    message: "This action needs a signed-in session, not an API key",
  });
}

/** Throws {@link sessionRequiredError} for an API key. */
export function assertSessionCredential(credential: ApiCredential): void {
  if (credential.kind === "session") return;
  throw sessionRequiredError();
}
