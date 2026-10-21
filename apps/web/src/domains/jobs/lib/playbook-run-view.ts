import { capabilityLabel } from "@/shared/ui/vocab";
import type { DisplayStatus } from "@/shared/ui/vocab/status.lib";
import type { PlaybookRunView } from "@watchdog/schemas/jobs";
import {
  PLAYBOOK_RUN_OUTCOME_LABELS,
  PLAYBOOK_STEP_STATE_LABELS,
  type PlaybookRunOutcome,
  type PlaybookRunStatus,
  type PlaybookStepState,
} from "@watchdog/schemas/shared";

/** A status chip or ink: the vocab status that carries the colour and glyph, and the word shown. */
export type OutcomeDisplay = {
  status: DisplayStatus;
  label: string;
};

export type RunStepRow = {
  key: string;
  /** Zero-based recipe step, the key the Job rows use (`playbookStep`). */
  step: number;
  /** The first Job of the step, to select it from the spine; null when the step has none. */
  jobId: string | null;
  capability: string;
  outcome: OutcomeDisplay;
  /** Why the step failed without a Job or was skipped, in sentence form; null otherwise. */
  reason: string | null;
};

/**
 * Why a step has no Job: a skipped step names the step that held it back, one-based and with
 * the Cap's label, as the spine numbers steps; any other reason (a bind or fan-out error) is
 * the API's own words.
 */
function stepReason(
  step: PlaybookRunView["steps"][number],
  steps: PlaybookRunView["steps"]
): string | null {
  if (step.blockedBy !== undefined) {
    const root = steps.find((entry) => entry.step === step.blockedBy);
    return `Step ${step.blockedBy + 1} (${capabilityLabel(root?.capabilityId)}) did not succeed`;
  }
  return step.reason ?? null;
}

const STEP_STATE_STATUS: Record<PlaybookStepState, DisplayStatus> = {
  succeeded: "succeeded",
  failed: "failed",
  running: "running",
  skipped: "cancelled",
  pending: "pending",
};

const RUN_OUTCOME_STATUS: Record<PlaybookRunOutcome, DisplayStatus> = {
  succeeded: "succeeded",
  partial: "contested",
  failed: "failed",
};

/**
 * How a step reads in the spine. `skipped` has no Job and no status of its own, so it borrows
 * the grey `cancelled` tone with its own word; a step still `pending` in a run that was
 * cancelled never runs, so it reads "Not run".
 */
export function stepOutcomeDisplay(
  state: PlaybookStepState,
  runStatus: PlaybookRunStatus
): OutcomeDisplay {
  if (state === "pending" && runStatus === "cancelled") {
    return { status: "cancelled", label: "Not run" };
  }
  return {
    status: STEP_STATE_STATUS[state],
    label: PLAYBOOK_STEP_STATE_LABELS[state],
  };
}

/** The outcome word for a run row; the list carries `playbookRunOutcome` on every step Job. */
export function outcomeDisplay(
  outcome: PlaybookRunOutcome | null
): OutcomeDisplay | null {
  if (outcome === null) return null;
  return {
    status: RUN_OUTCOME_STATUS[outcome],
    label: PLAYBOOK_RUN_OUTCOME_LABELS[outcome],
  };
}

/**
 * The run's outcome for the Detail header. Null while the run is open, and for a run
 * cancelled by a person (it has no outcome). `partial` borrows the amber `contested` tone.
 */
export function runOutcomeDisplay(
  run: Pick<PlaybookRunView, "status" | "outcome">
): OutcomeDisplay | null {
  if (run.status === "cancelled") {
    return { status: "cancelled", label: "Cancelled" };
  }
  return outcomeDisplay(run.outcome);
}

/** One row per recipe step, in order. */
export function buildRunStepRows(run: PlaybookRunView): RunStepRow[] {
  return run.steps.map((step) => ({
    key: `${step.step}-${step.capabilityId}`,
    step: step.step,
    jobId: step.jobIds[0] ?? null,
    capability: capabilityLabel(step.capabilityId),
    outcome: stepOutcomeDisplay(step.state, run.status),
    reason: stepReason(step, run.steps),
  }));
}

/** A one-line count for the spine header, e.g. `1 failed · 1 skipped`; empty when every step is clean. */
export function runStepTally(run: PlaybookRunView): string {
  const counts = new Map<PlaybookStepState, number>();
  for (const step of run.steps) {
    counts.set(step.state, (counts.get(step.state) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const state of ["failed", "skipped"] as const) {
    const n = counts.get(state) ?? 0;
    if (n > 0) parts.push(`${n} ${state}`);
  }
  return parts.join(" · ");
}
