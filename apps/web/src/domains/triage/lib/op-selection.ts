import type { PatchOp } from "@watchdog/schemas/graph";
import {
  patchOpDependents,
  withPatchDependencies,
} from "@watchdog/schemas/graph";

/**
 * Unticks an op with every op that needs it, or ticks it with every op it needs: a partial
 * Accept never names a change without the Entity it is on.
 */
export function toggleOpSkip(
  patch: readonly PatchOp[],
  skipped: readonly string[],
  opId: string
): string[] {
  const set = new Set(skipped);
  if (set.has(opId)) {
    for (const id of withPatchDependencies(patch, [opId])) set.delete(id);
  } else {
    set.add(opId);
    for (const id of patchOpDependents(patch, opId)) set.add(id);
  }
  return patch.flatMap((op) => (set.has(op.id) ? [op.id] : []));
}

/** Ticks (or unticks) every op of a group, with what they need (or what needs them). */
export function setOpsTicked(
  patch: readonly PatchOp[],
  skipped: readonly string[],
  opIds: readonly string[],
  isTicked: boolean
): string[] {
  const set = new Set(skipped);
  if (isTicked) {
    for (const id of withPatchDependencies(patch, opIds)) set.delete(id);
  } else {
    for (const opId of opIds) {
      set.add(opId);
      for (const id of patchOpDependents(patch, opId)) set.add(id);
    }
  }
  return patch.flatMap((op) => (set.has(op.id) ? [op.id] : []));
}

/** The ops an Accept would apply. */
export function tickedPatch(
  patch: readonly PatchOp[],
  skipped: readonly string[]
): PatchOp[] {
  const set = new Set(skipped);
  return patch.filter((op) => !set.has(op.id));
}

/** `opIds` for the Accept request: none when every op is ticked (the whole patch). */
export function acceptOpIds(
  patch: readonly PatchOp[],
  skipped: readonly string[]
): string[] | undefined {
  if (skipped.length === 0) return undefined;
  return tickedPatch(patch, skipped).map((op) => op.id);
}
