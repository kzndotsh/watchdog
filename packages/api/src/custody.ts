import { ORPCError } from "@orpc/server";

import { childWriteViolation } from "@watchdog/policy";
import type { ApiAuthMethod } from "@watchdog/schemas";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function requireUserOverride(userOverride: unknown): void {
  const violation = childWriteViolation({
    userOverride,
    confidence: undefined,
  });
  if (violation) {
    throw new ORPCError("FORBIDDEN", { message: violation.message });
  }
}

/** Agent ingress refuses confirmed outright — Inbox Accept / Dossier may set confirmed. */
export function refuseConfirmed(confidence: unknown): void {
  const violation = childWriteViolation({ userOverride: true, confidence });
  if (violation) {
    throw new ORPCError("FORBIDDEN", { message: violation.message });
  }
}

/** API-key child Graph writes: userOverride + no confirmed (matches CLI custody). */
export function assertAgentChildWriteCustody(
  input: unknown,
  authMethod: ApiAuthMethod | undefined
): void {
  if (authMethod !== "apiKey" || !isRecord(input)) return;
  requireUserOverride(input.userOverride);
  refuseConfirmed(input.confidence);
}
