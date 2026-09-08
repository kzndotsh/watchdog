import type { JobListRecord } from "@/domains/jobs/types";
import { capabilityLabel, playbookLabel, statusLabel } from "@/shared/ui/vocab";
import {
  JOB_STATUSES,
  PLAYBOOK_AGGREGATE_STATUS_PRIORITY,
  catalogIdMatchesSearch,
  isOpenJobStatus,
  summarizeJobInput,
  type JobStatus,
  type PlaybookRunStatus,
} from "@watchdog/schemas";

export { JOB_STATUS_OPTIONS as STATUS_FACET_OPTIONS } from "@/shared/ui/vocab";
export { summarizeJobInput };

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

export interface JobQueueFilters {
  q: string;
  statuses: JobStatus[];
  capabilityIds: string[];
}

export const EMPTY_JOB_FILTERS: JobQueueFilters = {
  q: "",
  statuses: [],
  capabilityIds: [],
};

// ─── status meta ─────────────────────────────────────────────────────────────

export const CANCELABLE = new Set<JobStatus>(
  JOB_STATUSES.filter(
    (s) => s === "queued" || s === "running" || s === "blocked"
  )
);
export const LIVE_STATUSES = new Set<JobStatus>(
  JOB_STATUSES.filter((s) => s === "queued" || s === "running")
);

export function isLive(status: JobStatus): boolean {
  return LIVE_STATUSES.has(status);
}

// ─── display helpers ─────────────────────────────────────────────────────────

// ─── filtering + sorting ─────────────────────────────────────────────────────

export function filterJobQueue(
  jobs: JobListRecord[],
  filters: JobQueueFilters,
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): JobListRecord[] {
  let out = jobs;
  if (filters.statuses.length > 0) {
    const statuses = new Set(filters.statuses);
    out = out.filter((j) => statuses.has(j.status));
  }
  if (filters.capabilityIds.length > 0) {
    const capabilityIds = new Set(filters.capabilityIds);
    out = out.filter(
      (j) =>
        capabilityIds.has(j.capabilityId) ||
        (j.playbookId !== null && capabilityIds.has(j.playbookId))
    );
  }
  if (filters.q.trim()) {
    const q = filters.q.toLowerCase().trim();
    out = out.filter(
      (j) =>
        catalogIdMatchesSearch(j.capabilityId, q) ||
        capabilityLabel(j.capabilityId).toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q) ||
        statusLabel(j.status).toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q) ||
        (j.playbookId !== null && catalogIdMatchesSearch(j.playbookId, q)) ||
        (j.playbookId !== null &&
          playbookLabel(j.playbookId).toLowerCase().includes(q)) ||
        summarizeJobInput(j.input, evidenceTitleById, entityTitleById)
          .toLowerCase()
          .includes(q) ||
        (j.resultSummary ?? "").toLowerCase().includes(q) ||
        (j.error ?? "").toLowerCase().includes(q) ||
        (j.interpretError ?? "").toLowerCase().includes(q)
    );
  }
  return out;
}

export function sortJobQueue(jobs: JobListRecord[]): JobListRecord[] {
  return [...jobs].sort(
    (a, b) => Date.parse(jobActivityAt(b)) - Date.parse(jobActivityAt(a))
  );
}

/** Solo Cap Job or a playbook run cluster (steps ordered by playbookStep). */
export type JobQueueEntry =
  | { kind: "solo"; job: JobListRecord }
  | {
      kind: "playbook";
      runId: string;
      playbookId: string;
      playbookRunStatus: PlaybookRunStatus | null;
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
        steps,
      });
      continue;
    }
    entries.push({ kind: "solo", job });
  }

  return entries;
}

export function countLiveJobs(jobs: JobListRecord[]): number {
  return groupJobsForQueue(jobs).filter((entry) => {
    if (entry.kind === "playbook") {
      return entry.steps.some((step) => LIVE_STATUSES.has(step.status));
    }
    return LIVE_STATUSES.has(entry.job.status);
  }).length;
}

/** Aggregate status for a playbook run (live > blocked > failed > …). */
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

export function playbookRunStatus(
  steps: readonly JobListRecord[],
  recipeTotal?: number,
  runStatus?: PlaybookRunStatus | null
): JobStatus {
  if (runStatus === "finished") return finishedPlaybookRunStatus(steps);
  if (runStatus === "cancelled") return "cancelled";
  return livePlaybookRunStatus(steps, recipeTotal);
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

// ─── capability facets ───────────────────────────────────────────────────────

export function capabilityFacetOptions(
  jobs: JobListRecord[]
): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const job of jobs) {
    if (job.playbookId && !seen.has(job.playbookId)) {
      seen.add(job.playbookId);
      out.push({
        value: job.playbookId,
        label: playbookLabel(job.playbookId),
      });
    }
    if (!seen.has(job.capabilityId)) {
      seen.add(job.capabilityId);
      out.push({
        value: job.capabilityId,
        label: capabilityLabel(job.capabilityId),
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
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
