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
