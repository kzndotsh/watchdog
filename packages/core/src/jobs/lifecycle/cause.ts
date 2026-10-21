/**
 * Why a Job ended `failed` or `cancelled`, stored in `jobs.error_code`. The union is closed:
 * a new cause is a new member here, never a free string. The free-text `jobs.error` stays as
 * the human detail beside it.
 */
export const JOB_STOP_CAUSES = [
  "user_cancelled",
  "case_deleted",
  "access_revoked",
  "cap_timeout",
  "cap_failed",
  "queue_aborted",
  "worker_shutdown",
  "stale",
  "orphaned",
  "preflight_failed",
  "legacy_blocked",
] as const;

export type JobStopCause = (typeof JOB_STOP_CAUSES)[number];
