import { ORPCError } from "@orpc/server";

import { childWriteViolation } from "@watchdog/policy";
import {
  trimmedConfidenceTierSchema,
  type ApiCredential,
} from "@watchdog/schemas/shared";

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

/**
 * Agent ingress refuses confirmed outright — Inbox Accept / Dossier may set confirmed. This runs
 * before input validation, so it reads `confidence` through the same schema the procedure
 * validates with: whatever that schema accepts as confirmed is refused here.
 */
export function refuseConfirmed(confidence: unknown): void {
  const parsed = trimmedConfidenceTierSchema.safeParse(confidence);
  const violation = childWriteViolation({
    userOverride: true,
    confidence: parsed.success ? parsed.data : confidence,
  });
  if (violation) {
    throw new ORPCError("FORBIDDEN", { message: violation.message });
  }
}

/** API-key child Graph writes: userOverride + no confirmed (matches CLI custody). */
export function assertAgentChildWriteCustody(
  input: unknown,
  credential: ApiCredential
): void {
  if (credential.kind !== "apiKey" || !isRecord(input)) return;
  requireUserOverride(input.userOverride);
  refuseConfirmed(input.confidence);
}
