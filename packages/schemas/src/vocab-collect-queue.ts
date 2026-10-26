/**
 * Collect's queue (#574): the rows of the `collect_queue` projection, one per slot of the
 * partition today's queue builder makes of a Case's Evidence and Jobs.
 * - `evidence`: an Evidence row (hidden ones included), holding the Jobs attached to it.
 * - `run`: a playbook run, holding its steps that attached to no visible Evidence.
 * - `job`: a Job with no run that attached to no visible Evidence.
 */
export const COLLECT_ROW_KINDS = ["evidence", "run", "job"] as const;
export type CollectRowKind = (typeof COLLECT_ROW_KINDS)[number];

/**
 * A queue row's state. An Evidence row is `hidden`, `unprocessed` or `landed`; a run or Job
 * row is the state of its current attempts by priority: `running` > `queued` > `failed` >
 * `cancelled` > `landed` (every attempt succeeded).
 */
export const COLLECT_ROW_STATES = [
  "queued",
  "running",
  "unprocessed",
  "landed",
  "failed",
  "cancelled",
  "hidden",
] as const;
export type CollectRowState = (typeof COLLECT_ROW_STATES)[number];
