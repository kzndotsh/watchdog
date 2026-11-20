import { Effect } from "effect";

import type { PatchOp } from "@watchdog/schemas/graph";
import { withPatchDependencies } from "@watchdog/schemas/graph";
import type { UntickedOpOutcome } from "@watchdog/schemas/jobs";

import { InvalidError } from "../errors/tagged-errors";

/** What a (partial) Accept applies of a Proposal's patch, and how it records the rest. */
export type AcceptSelection = {
  readonly applied: readonly PatchOp[];
  readonly leftOpIds: readonly string[];
  readonly rejectedOps: readonly PatchOp[];
};

/**
 * Splits a Proposal's patch by the ops the reviewer ticked: `opIds` omitted applies all of it.
 * Refuses an empty choice, an id that is not an op of the patch, and a choice missing an op one
 * of its ops names (an Identifier on an Entity the patch creates, without that Entity).
 */
export function selectAcceptedOpsEffect(
  patch: readonly PatchOp[],
  opIds: readonly string[] | undefined,
  untickedAs: UntickedOpOutcome
): Effect.Effect<AcceptSelection, InvalidError> {
  if (opIds === undefined) {
    return Effect.succeed({ applied: patch, leftOpIds: [], rejectedOps: [] });
  }
  const chosen = new Set(opIds);
  if (chosen.size === 0) {
    return new InvalidError({
      reason: "Choose at least one change to accept, or reject the Proposal",
    });
  }
  const known = new Set(patch.map((op) => op.id));
  if ([...chosen].some((id) => !known.has(id))) {
    return new InvalidError({
      reason: "A chosen change is not in this Proposal",
    });
  }
  // Every op the chosen ones need, transitively, must itself be chosen.
  const needed = withPatchDependencies(patch, chosen);
  if ([...needed].some((id) => !chosen.has(id))) {
    return new InvalidError({
      reason:
        "A chosen change depends on a change that is not chosen (an Entity this Proposal creates)",
    });
  }
  const applied = patch.filter((op) => chosen.has(op.id));
  const unticked = patch.filter((op) => !chosen.has(op.id));
  return Effect.succeed(
    untickedAs === "rejected"
      ? { applied, leftOpIds: [], rejectedOps: unticked }
      : { applied, leftOpIds: unticked.map((op) => op.id), rejectedOps: [] }
  );
}
