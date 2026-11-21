/**
 * Field stubs for Watchdog process logs.
 * Keep payloads small; never put Evidence body / secrets here.
 */

export type JobLogFields = {
  jobId?: string;
  outcome?: string;
  stopReason?: string;
  abortReason?: string;
  fromCache?: boolean;
  reclaim?: boolean;
  durationMs?: number;
};

export type CaseLogFields = {
  caseId?: string;
};

export type CapLogFields = {
  capabilityId?: string;
  playbookRunId?: string;
};

export type UserLogFields = {
  userId?: string;
  email?: string;
};

export type AuthLogFields = {
  method?: "session" | "apiKey" | "none";
  denied?: boolean;
  reason?: string;
};

/**
 * Database work one request did, counted at core's `tryDb` seam. Counts and
 * times only: never SQL text, parameters or rows.
 */
export type DbLogFields = {
  /** Database calls through `tryDb` / `tryDbWith` (transaction BEGIN/COMMIT excluded). */
  queries: number;
  /** Total time of those calls in ms, summed, so overlapping calls can exceed `durationMs`. */
  ms: number;
};

/** Top-level fields on the request wide event (API routes and server functions). */
export type RequestTimingLogFields = {
  /** Wall time of the request in ms, measured in the request middleware. */
  durationMs: number;
  db: DbLogFields;
};

function trimLogId(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function jobWideEventFields(input: {
  jobId: string;
  outcome: string;
  stopReason?: string;
  abortReason?: string;
  fromCache?: boolean;
  reclaim?: boolean;
  durationMs?: number;
  caseId?: string;
  capabilityId?: string;
  playbookRunId?: string | null;
}): {
  job: JobLogFields;
  case?: CaseLogFields;
  cap: CapLogFields;
} {
  const jobId = trimLogId(input.jobId);
  const caseId = trimLogId(input.caseId);
  const capabilityId = trimLogId(input.capabilityId);
  const playbookRunId = trimLogId(input.playbookRunId);

  return {
    job: {
      jobId,
      outcome: input.outcome,
      stopReason: input.stopReason,
      abortReason: input.abortReason,
      fromCache: input.fromCache,
      reclaim: input.reclaim,
      durationMs: input.durationMs,
    },
    case: caseId === undefined ? undefined : { caseId },
    cap: {
      capabilityId,
      playbookRunId,
    },
  };
}
