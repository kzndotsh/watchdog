import {
  CONFIDENCE_GATED_RESOURCES,
  type PatchOp,
} from "@watchdog/schemas/graph";

/** Resources where Inbox Accept must choose confidence. */
export function patchNeedsConfidence(
  patch: readonly PatchOp[] | null | undefined
): boolean {
  return (patch ?? []).some((op) =>
    CONFIDENCE_GATED_RESOURCES.has(op.resource)
  );
}
