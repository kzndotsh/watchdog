/** The one custody rule for agent/CLI child Graph writes. Pure; transports map the violation. */

export const USER_OVERRIDE_REQUIRED_MESSAGE =
  "Child Graph writes require a user override. Prefer proposals create or graph write.";

export const CONFIRMED_REFUSED_MESSAGE =
  "Agent and CLI child Graph writes refuse confidence=confirmed. Accept via Inbox or edit in Dossier.";

export type ChildWriteViolation =
  | { kind: "user-override-required"; message: string }
  | { kind: "confirmed-refused"; message: string };

/**
 * Null when allowed. Override is checked first, then confirmed (which is refused even with override).
 * Only a literal `true` counts as an override.
 */
export function childWriteViolation(input: {
  userOverride: unknown;
  confidence: unknown;
}): ChildWriteViolation | null {
  if (input.userOverride !== true) {
    return {
      kind: "user-override-required",
      message: USER_OVERRIDE_REQUIRED_MESSAGE,
    };
  }
  if (input.confidence === "confirmed") {
    return { kind: "confirmed-refused", message: CONFIRMED_REFUSED_MESSAGE };
  }
  return null;
}
