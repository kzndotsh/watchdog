/**
 * Field stubs for Watchdog process logs.
 * Keep payloads small; never put Evidence body / secrets here.
 */

export interface JobLogFields {
  jobId?: string;
  outcome?: string;
  stopReason?: string;
  abortReason?: string;
  fromCache?: boolean;
  reclaim?: boolean;
  durationMs?: number;
}

export interface CaseLogFields {
  caseId?: string;
}

export interface CapLogFields {
  capabilityId?: string;
  playbookRunId?: string;
}

export interface UserLogFields {
  userId?: string;
  email?: string;
}

export interface AuthLogFields {
  method?: "session" | "apiKey" | "none";
  denied?: boolean;
  reason?: string;
}

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
