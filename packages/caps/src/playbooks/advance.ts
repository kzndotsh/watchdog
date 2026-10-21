import {
  isOpenJobStatus,
  type JobStatus,
  type JsonObject,
  type PlaybookRunOutcome,
  type PlaybookStepState,
} from "@watchdog/schemas/shared";

import { playbookStepDependencies } from "./dependencies";
import {
  formatPlanError,
  isPlanError,
  materializeBoundInput,
  materializeFanOutInputs,
  normalizePlaybookStep,
  type PlaybookDef,
  type PlaybookStepDef,
  type PredecessorJob,
  type SeedValues,
} from "./plan";

export type PlaybookJobView = {
  step: number;
  status: JobStatus;
};

/** What the run does next. A run is abandoned only by a user cancel, never by a step failing. */
export type PlaybookAdvance =
  | { kind: "wait" }
  | { kind: "finish"; outcome: PlaybookRunOutcome }
  | { kind: "enqueue"; step: number; inputs: JsonObject[] };

/** One step of a run, derived from the recipe and the run's Jobs; nothing about it is stored. */
export type PlaybookStepView = {
  step: number;
  capabilityId: string;
  state: PlaybookStepState;
  /** Why a step `failed` without a Job (bind or fan-out error), or why it has no Job but succeeded. Not set on a `skipped` step: see `blockedBy`. */
  reason?: string;
  /** On a `skipped` step, the step that held it back: the root failed step when there is one. */
  blockedBy?: number;
};

type Evaluation = {
  views: PlaybookStepView[];
  next?: { step: number; inputs: JsonObject[] };
};

type Materialized =
  | { kind: "enqueue"; inputs: JsonObject[] }
  | { kind: "empty" }
  | { kind: "error"; reason: string };

function materializeStep(
  def: PlaybookStepDef,
  seed: SeedValues,
  predecessors: readonly PredecessorJob[]
): Materialized {
  if (def.fanOut !== undefined) {
    const inputs = materializeFanOutInputs(def, seed, predecessors);
    if (isPlanError(inputs)) {
      return { kind: "error", reason: formatPlanError(inputs) };
    }
    return inputs.length === 0
      ? { kind: "empty" }
      : { kind: "enqueue", inputs };
  }
  const bound = materializeBoundInput(def, seed, predecessors);
  if (isPlanError(bound)) {
    return { kind: "error", reason: formatPlanError(bound) };
  }
  return { kind: "enqueue", inputs: [bound] };
}

function stateFromJobs(statuses: readonly JobStatus[]): PlaybookStepState {
  if (statuses.some((status) => isOpenJobStatus(status))) return "running";
  return statuses.includes("succeeded") ? "succeeded" : "failed";
}

function evaluate(
  playbook: PlaybookDef,
  seed: SeedValues,
  jobs: readonly PlaybookJobView[],
  predecessors: readonly PredecessorJob[]
): Evaluation {
  const defs = playbook.steps.map(normalizePlaybookStep);
  const dependencies = playbookStepDependencies(playbook);
  const views: PlaybookStepView[] = [];
  let next: Evaluation["next"];
  // Steps run one at a time, in order: once a step is running or about to be enqueued, the
  // later steps without a Job are pending (their inputs are not read yet).
  let blocked = false;

  for (const [step, def] of defs.entries()) {
    const { capabilityId } = def;
    const at = jobs.filter((job) => job.step === step);

    if (at.length > 0) {
      const state = stateFromJobs(at.map((job) => job.status));
      if (state === "running") blocked = true;
      views.push({ step, capabilityId, state });
      continue;
    }

    const ended = (dependencies[step] ?? []).filter((source) => {
      const state = views[source]?.state;
      return state === "failed" || state === "skipped";
    });
    if (ended.length > 0) {
      const root = ended.find((source) => views[source]?.state === "failed");
      const source = root ?? ended[0];
      views.push({
        step,
        capabilityId,
        state: "skipped",
        blockedBy: source,
      });
      continue;
    }

    if (blocked) {
      views.push({ step, capabilityId, state: "pending" });
      continue;
    }

    const made = materializeStep(def, seed, predecessors);
    switch (made.kind) {
      case "error": {
        views.push({
          step,
          capabilityId,
          state: "failed",
          reason: made.reason,
        });
        break;
      }
      case "empty": {
        views.push({
          step,
          capabilityId,
          state: "succeeded",
          reason: "fan-out had no inputs",
        });
        break;
      }
      case "enqueue": {
        blocked = true;
        next = { step, inputs: made.inputs };
        views.push({ step, capabilityId, state: "pending" });
        break;
      }
      default: {
        const _exhaustive: never = made;
        return _exhaustive;
      }
    }
  }

  return { views, next };
}

/**
 * Per-step view of a run: running, succeeded or failed from the step's Jobs (a step succeeded
 * when any of its Jobs did); a step with no Job is skipped when a step it depends on ended
 * without success, failed when its bind or fan-out cannot be built, succeeded when a fan-out
 * had no inputs, and pending otherwise. Retrying a failed step's Job un-skips its dependents
 * with no bookkeeping.
 */
export function playbookStepViews(
  playbook: PlaybookDef,
  seed: SeedValues,
  jobs: readonly PlaybookJobView[],
  predecessors: readonly PredecessorJob[]
): PlaybookStepView[] {
  return evaluate(playbook, seed, jobs, predecessors).views;
}

/** `succeeded` when every step did, `failed` when none did, `partial` otherwise. */
function playbookRunOutcome(
  views: readonly Pick<PlaybookStepView, "state">[]
): PlaybookRunOutcome {
  const succeeded = views.filter((view) => view.state === "succeeded").length;
  if (succeeded === 0) return "failed";
  return succeeded === views.length ? "succeeded" : "partial";
}

export function decidePlaybookAdvance(
  playbook: PlaybookDef,
  seed: SeedValues,
  jobs: readonly PlaybookJobView[],
  predecessors: readonly PredecessorJob[]
): PlaybookAdvance {
  const { views, next } = evaluate(playbook, seed, jobs, predecessors);
  if (views.some((view) => view.state === "running")) return { kind: "wait" };
  if (next !== undefined) return { kind: "enqueue", ...next };
  return { kind: "finish", outcome: playbookRunOutcome(views) };
}
