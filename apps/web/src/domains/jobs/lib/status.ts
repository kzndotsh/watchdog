import type { JobListRecord } from "@watchdog/core/jobs";
import {
  CANCELLABLE_JOB_STATUSES,
  LIVE_JOB_STATUSES,
  PLAYBOOK_AGGREGATE_STATUS_PRIORITY,
  isLiveJobStatus,
  isOpenJobStatus,
  isTerminalJobStatus,
  type JobStatus,
  type PlaybookRunOutcome,
  type PlaybookRunStatus,
} from "@watchdog/schemas/shared";

export { JOB_STATUS_OPTIONS as STATUS_FACET_OPTIONS } from "@/shared/ui/vocab";

/** Trim playbook run id; blank / whitespace → null. */
export function normalizedPlaybookRunId(
  runId: string | null | undefined
): string | null {
  if (runId === null || runId === undefined) return null;
  const trimmed = runId.trim();
  return trimmed === "" ? null : trimmed;
}

/** Latest activity instant for queue ordering and day grouping. */
export function jobActivityAt(job: JobListRecord): string {
  return job.updatedAt ?? job.createdAt;
}

// ─── status meta ─────────────────────────────────────────────────────────────

export const CANCELABLE = new Set<JobStatus>(CANCELLABLE_JOB_STATUSES);
export const LIVE_STATUSES = new Set<JobStatus>(LIVE_JOB_STATUSES);

export const isLive = isLiveJobStatus;
export const isTerminal = isTerminalJobStatus;

// ─── display helpers ─────────────────────────────────────────────────────────

/** Solo Cap Job or a playbook run cluster (steps ordered by playbookStep). */
export type JobQueueEntry =
  | { kind: "solo"; job: JobListRecord }
  | {
      kind: "playbook";
      runId: string;
      playbookId: string;
      playbookRunStatus: PlaybookRunStatus | null;
      playbookRunOutcome: PlaybookRunOutcome | null;
      steps: JobListRecord[];
    };

/**
 * Collapse playbook steps that share `playbookRunId` into one entry.
 * Preserves newest-first order of first sighting (solos + run heads).
 */
export function groupJobsForQueue(jobs: JobListRecord[]): JobQueueEntry[] {
  const seenRuns = new Set<string>();
  const entries: JobQueueEntry[] = [];

  for (const job of jobs) {
    const runId = normalizedPlaybookRunId(job.playbookRunId);
    if (runId !== null) {
      if (seenRuns.has(runId)) continue;
      seenRuns.add(runId);
      const steps = jobs
        .filter((j) => normalizedPlaybookRunId(j.playbookRunId) === runId)
        .sort((a, b) => (a.playbookStep ?? 0) - (b.playbookStep ?? 0));
      const playbookId =
        steps.find((j) => j.playbookId !== null && j.playbookId !== "")
          ?.playbookId ?? runId;
      entries.push({
        kind: "playbook",
        runId,
        playbookId,
        playbookRunStatus: job.playbookRunStatus,
        playbookRunOutcome: job.playbookRunOutcome,
        steps,
      });
      continue;
    }
    entries.push({ kind: "solo", job });
  }

  return entries;
}

/** Aggregate status for a playbook run (live > failed > …). */
function playbookRecipeDone(steps: readonly JobListRecord[]): number {
  const byStep = new Map<number, JobListRecord[]>();
  for (const step of steps) {
    const n = step.playbookStep ?? 0;
    const group = byStep.get(n) ?? [];
    group.push(step);
    byStep.set(n, group);
  }
  const ordered = [...byStep.keys()].sort((a, b) => a - b);
  let done = 0;
  for (const n of ordered) {
    const at = byStep.get(n) ?? [];
    if (at.some((j) => isOpenJobStatus(j.status))) {
      break;
    }
    done += 1;
  }
  return done;
}

function finishedPlaybookRunStatus(steps: readonly JobListRecord[]): JobStatus {
  if (steps.some((s) => s.status === "failed")) return "failed";
  if (steps.some((s) => s.status === "cancelled")) return "cancelled";
  return "succeeded";
}

const LIVE_STEP_STATUS_PRIORITY = PLAYBOOK_AGGREGATE_STATUS_PRIORITY.filter(
  (status) => status !== "succeeded"
);

function livePlaybookRunStatus(
  steps: readonly JobListRecord[],
  recipeTotal?: number
): JobStatus {
  const statuses = steps.map((s) => s.status);
  for (const status of LIVE_STEP_STATUS_PRIORITY) {
    if (statuses.some((s) => s === status)) return status;
  }
  const total = recipeTotal ?? steps.length;
  if (playbookRecipeDone(steps) < total) return "queued";
  if (statuses.length > 0 && statuses.every((s) => s === "succeeded")) {
    return "succeeded";
  }
  return statuses[0] ?? "queued";
}

/**
 * The Jobs that stand for a run's steps: a Job a later attempt retried is out, so a failed
 * step whose retry succeeded no longer reads as failed (a retry resumes the run, #354).
 */
export function currentAttempts<
  T extends Pick<JobListRecord, "id" | "retryOfJobId">,
>(jobs: readonly T[]): T[] {
  const retried = new Set(
    jobs.flatMap((job) => (job.retryOfJobId === null ? [] : [job.retryOfJobId]))
  );
  return jobs.filter((job) => !retried.has(job.id));
}

export function playbookRunStatus(
  steps: readonly JobListRecord[],
  recipeTotal?: number,
  runStatus?: PlaybookRunStatus | null
): JobStatus {
  const current = currentAttempts(steps);
  if (runStatus === "finished") return finishedPlaybookRunStatus(current);
  if (runStatus === "cancelled") return "cancelled";
  return livePlaybookRunStatus(current, recipeTotal);
}

export function playbookRunProgress(
  steps: readonly JobListRecord[],
  recipeTotal?: number,
  runStatus?: PlaybookRunStatus | null
): {
  done: number;
  total: number;
} {
  const total = recipeTotal ?? steps.length;
  if (runStatus === "finished" || runStatus === "cancelled") {
    return { done: total, total };
  }
  return { done: playbookRecipeDone(steps), total };
}

export function playbookWaitingOnNextStep(
  steps: readonly JobListRecord[],
  recipeTotal?: number,
  runStatus?: PlaybookRunStatus | null
): boolean {
  if (runStatus === "finished" || runStatus === "cancelled") return false;
  const { done, total } = playbookRunProgress(steps, recipeTotal, runStatus);
  return done < total && !steps.some((s) => isOpenJobStatus(s.status));
}

export function formatDuration(
  startedAt: string | null,
  finishedAt: string | null
): string | null {
  if (startedAt === null || startedAt === "") return null;
  const end =
    finishedAt !== null && finishedAt !== ""
      ? new Date(finishedAt)
      : new Date();
  const ms = end.getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}
