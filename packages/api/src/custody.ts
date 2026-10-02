import { ORPCError } from "@orpc/server";

import type { ApiAuthMethod } from "@watchdog/schemas";

const CHILD_WRITE_OVERRIDE_MSG =
  "Child Graph writes require userOverride: true. Prefer proposals create or graph write.";
const CHILD_WRITE_CONFIRMED_MSG =
  "API refuses confidence=confirmed on child Graph writes. Accept via Inbox or edit in Dossier.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function requireUserOverride(userOverride: unknown): void {
  if (userOverride !== true) {
    throw new ORPCError("FORBIDDEN", { message: CHILD_WRITE_OVERRIDE_MSG });
  }
}

/** Agent ingress refuses confirmed outright — Inbox Accept / Dossier may set confirmed. */
export function refuseConfirmed(confidence: unknown): void {
  if (confidence === "confirmed") {
    throw new ORPCError("FORBIDDEN", { message: CHILD_WRITE_CONFIRMED_MSG });
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
