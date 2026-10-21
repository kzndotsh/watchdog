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
