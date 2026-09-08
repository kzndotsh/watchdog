import {
  isOpenJobStatus,
  type JobStatus,
  type JsonObject,
} from "@watchdog/schemas";

import {
  isPlanError,
  materializeBoundInput,
  materializeFanOutInputs,
  normalizePlaybookStep,
  type PlaybookDef,
  type PlaybookStepDef,
  type PredecessorJob,
  type SeedValues,
} from "./plan";

export interface PlaybookJobView {
  step: number;
  status: JobStatus;
}

export type PlaybookAdvance =
  | { kind: "wait" }
  | { kind: "finish" }
  | { kind: "abandon"; reason: string }
  | { kind: "enqueue"; step: number; inputs: JsonObject[] };

function enqueueStep(
  def: PlaybookStepDef,
  seed: SeedValues,
  predecessors: readonly PredecessorJob[],
  step: number
): PlaybookAdvance {
  if (def.fanOut !== undefined) {
    const inputs = materializeFanOutInputs(def, seed, predecessors);
    if (isPlanError(inputs)) {
      return {
        kind: "abandon",
        reason: `Cancelled — fan-out failed: ${inputs.kind}`,
      };
    }
    if (inputs.length === 0) return { kind: "finish" };
    return { kind: "enqueue", step, inputs };
  }

  const bound = materializeBoundInput(def, seed, predecessors);
  if (isPlanError(bound)) {
    return {
      kind: "abandon",
      reason: `Cancelled — bind failed: ${bound.kind}`,
    };
  }
  return { kind: "enqueue", step, inputs: [bound] };
}

export function decidePlaybookAdvance(
  playbook: PlaybookDef,
  seed: SeedValues,
  jobs: readonly PlaybookJobView[],
  predecessors: readonly PredecessorJob[]
): PlaybookAdvance {
  const defs = playbook.steps.map(normalizePlaybookStep);

  for (let step = 0; step < defs.length; step += 1) {
    const def = defs[step];
    const at = jobs.filter((j) => j.step === step);
    const open = at.filter((j) => isOpenJobStatus(j.status));
    // Legacy: pre-lazy-release runs may still have `blocked` step rows.
    const blockedOnly =
      open.length > 0 && open.every((j) => j.status === "blocked");

    if (open.length > 0 && !blockedOnly) return { kind: "wait" };

    if (blockedOnly && at.some((j) => j.status === "succeeded")) {
      const nextDef = defs[step + 1];
      if (nextDef === undefined) {
        continue;
      }
      return enqueueStep(nextDef, seed, predecessors, step + 1);
    }

    if (at.length === 0 || blockedOnly) {
      if (step === 0) return enqueueStep(def, seed, predecessors, 0);
      const prev = jobs.filter((j) => j.step === step - 1);
      const prevOpen = prev.filter((j) => isOpenJobStatus(j.status));
      if (prev.length === 0 || prevOpen.length > 0) {
        return { kind: "wait" };
      }
      if (!prev.some((j) => j.status === "succeeded")) {
        const prevDef = defs[step - 1];
        if (prevDef.fanOut !== undefined) return { kind: "finish" };
        return {
          kind: "abandon",
          reason: "Cancelled — prior playbook step failed",
        };
      }
      return enqueueStep(def, seed, predecessors, step);
    }

    const nextDef = defs[step + 1];
    if (nextDef === undefined) {
      if (at.length > 0 && !at.some((j) => j.status === "succeeded")) {
        if (def.fanOut !== undefined) return { kind: "finish" };
        return {
          kind: "abandon",
          reason: "Cancelled — playbook step failed",
        };
      }
      continue;
    }

    if (!at.some((j) => j.status === "succeeded")) {
      return {
        kind: "abandon",
        reason: "Cancelled — playbook step failed",
      };
    }
  }

  return { kind: "finish" };
}
