export const PLAYBOOK_RUN_STATUSES = [
  "running",
  "finished",
  "cancelled",
] as const;
export type PlaybookRunStatus = (typeof PLAYBOOK_RUN_STATUSES)[number];

/** How a finished Playbook run went: every step succeeded, some did, or none did. */
export const PLAYBOOK_RUN_OUTCOMES = [
  "succeeded",
  "partial",
  "failed",
] as const;
export type PlaybookRunOutcome = (typeof PLAYBOOK_RUN_OUTCOMES)[number];

export const PLAYBOOK_RUN_OUTCOME_LABELS: Record<PlaybookRunOutcome, string> = {
  succeeded: "Succeeded",
  partial: "Partial",
  failed: "Failed",
};

/** One step of a Playbook run as the run view reports it (derived from the recipe and the run's Jobs, never stored). */
export const PLAYBOOK_STEP_STATES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const;
export type PlaybookStepState = (typeof PLAYBOOK_STEP_STATES)[number];

export const PLAYBOOK_STEP_STATE_LABELS: Record<PlaybookStepState, string> = {
  pending: "Pending",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  skipped: "Skipped",
};
