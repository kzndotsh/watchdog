import type { CollectRow, CollectRun } from "@/domains/collect/types";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import {
  groupJobsForQueue,
  playbookRunProgress,
  playbookRunStatus,
  type JobQueueEntry,
} from "@/domains/jobs/lib/status";
import { isOpenJobStatus } from "@watchdog/schemas";

import {
  classifyRun,
  jobLinksEvidence,
  landedEvidenceIds,
  shouldStayStandaloneJob,
} from "./collect-index-jobs";
import {
  buildEvidenceRow,
  buildJobRow,
  entityIdFromJobInput,
  sortRunsNewestFirst,
} from "./collect-index-rows";

export function seedEvidenceMaps(
  evidence: readonly EvidenceRecord[],
  titleFor: (row: EvidenceRecord) => string
): {
  readonly evidenceById: Map<string, EvidenceRecord>;
  readonly titleForEvidenceMap: Map<string, string>;
} {
  const evidenceById = new Map<string, EvidenceRecord>();
  const titleForEvidenceMap = new Map<string, string>();
  for (const row of evidence) {
    evidenceById.set(row.id, row);
    titleForEvidenceMap.set(row.id, titleFor(row));
  }
  return { evidenceById, titleForEvidenceMap };
}

export function assignJobsToEvidence(
  evidence: readonly EvidenceRecord[],
  jobs: readonly JobListRecord[]
): {
  readonly runsByEvidenceId: Map<string, CollectRun[]>;
  readonly assignedJobIds: Set<string>;
} {
  const assignedJobIds = new Set<string>();
  const runsByEvidenceId = new Map<string, CollectRun[]>();
  for (const row of evidence) {
    runsByEvidenceId.set(row.id, []);
  }

  for (const job of jobs) {
    if (shouldStayStandaloneJob(job)) {
      continue;
    }
    for (const row of evidence) {
      if (!jobLinksEvidence(job, row.id)) continue;
      const bucket = runsByEvidenceId.get(row.id);
      if (bucket === undefined) continue;
      bucket.push({ job, role: classifyRun(job) });
      assignedJobIds.add(job.id);
    }
  }

  return { runsByEvidenceId, assignedJobIds };
}

export function seedEvidenceRows(
  evidence: readonly EvidenceRecord[],
  runsByEvidenceId: ReadonlyMap<string, CollectRun[]>,
  rowsById: Map<string, CollectRow>,
  jobIdToRowId: Map<string, string>
): void {
  for (const row of evidence) {
    const runs = sortRunsNewestFirst(runsByEvidenceId.get(row.id) ?? []);
    const collectRow = buildEvidenceRow(row, runs);
    rowsById.set(row.id, collectRow);
    jobIdToRowId.set(row.id, row.id);
    for (const run of runs) {
      jobIdToRowId.set(run.job.id, row.id);
    }
  }
}

function appendPlaybookGroup(
  entry: Extract<JobQueueEntry, { kind: "playbook" }>,
  recipeStepsByPlaybookId: ReadonlyMap<string, number> | undefined,
  assignedJobIds: Set<string>,
  rowsById: Map<string, CollectRow>,
  jobIdToRowId: Map<string, string>
): void {
  const steps = entry.steps;
  const runs: CollectRun[] = steps.map((job) => ({
    job,
    role: "step" as const,
  }));
  const recipeTotal =
    recipeStepsByPlaybookId?.get(entry.playbookId) ?? steps.length;
  const progress = playbookRunProgress(
    steps,
    recipeTotal,
    entry.playbookRunStatus
  );
  const status = playbookRunStatus(steps, recipeTotal, entry.playbookRunStatus);
  const anchor = steps[0];
  if (anchor === undefined) return;
  for (const step of steps) {
    assignedJobIds.add(step.id);
  }
  const row = buildJobRow(entry.runId, sortRunsNewestFirst(runs), {
    evidence: null,
    when: anchor.createdAt,
    entityId: entityIdFromJobInput(anchor.input),
    playbookRunId: entry.runId,
    recipe: {
      step: progress.done + (isOpenJobStatus(status) ? 1 : progress.done),
      total: progress.total,
    },
  });
  rowsById.set(entry.runId, row);
  jobIdToRowId.set(entry.runId, entry.runId);
  for (const step of steps) {
    jobIdToRowId.set(step.id, entry.runId);
  }
}

function appendStandaloneJob(
  job: JobListRecord,
  evidenceById: ReadonlyMap<string, EvidenceRecord>,
  assignedJobIds: Set<string>,
  rowsById: Map<string, CollectRow>,
  jobIdToRowId: Map<string, string>
): void {
  const landed = landedEvidenceIds(job);
  const runs: CollectRun[] = [{ job, role: classifyRun(job) }];
  assignedJobIds.add(job.id);
  const row = buildJobRow(job.id, runs, {
    evidence:
      landed.length === 1 ? (evidenceById.get(landed[0] ?? "") ?? null) : null,
    when: job.createdAt,
    entityId: entityIdFromJobInput(job.input),
    playbookRunId: null,
    recipe: null,
  });
  rowsById.set(job.id, row);
  jobIdToRowId.set(job.id, job.id);
  if (landed.length === 1) {
    const evidenceId = landed[0];
    if (evidenceId !== undefined && rowsById.has(evidenceId)) {
      jobIdToRowId.set(job.id, evidenceId);
    }
  }
}

function appendOrphanJob(
  job: JobListRecord,
  assignedJobIds: Set<string>,
  rowsById: Map<string, CollectRow>,
  jobIdToRowId: Map<string, string>
): void {
  if (assignedJobIds.has(job.id)) return;
  const runs: CollectRun[] = [{ job, role: classifyRun(job) }];
  assignedJobIds.add(job.id);
  const row = buildJobRow(job.id, runs, {
    evidence: null,
    when: job.createdAt,
    entityId: entityIdFromJobInput(job.input),
    playbookRunId: job.playbookRunId,
    recipe: null,
  });
  rowsById.set(job.id, row);
  jobIdToRowId.set(job.id, job.id);
}

export function appendUnassignedJobRows(
  jobs: readonly JobListRecord[],
  assignedJobIds: Set<string>,
  evidenceById: ReadonlyMap<string, EvidenceRecord>,
  rowsById: Map<string, CollectRow>,
  jobIdToRowId: Map<string, string>,
  recipeStepsByPlaybookId: ReadonlyMap<string, number> | undefined
): void {
  const unassigned = jobs.filter((job) => !assignedJobIds.has(job.id));
  const grouped = groupJobsForQueue(unassigned);

  for (const entry of grouped) {
    if (entry.kind === "playbook") {
      appendPlaybookGroup(
        entry,
        recipeStepsByPlaybookId,
        assignedJobIds,
        rowsById,
        jobIdToRowId
      );
      continue;
    }

    const job = entry.job;
    if (shouldStayStandaloneJob(job)) {
      appendStandaloneJob(
        job,
        evidenceById,
        assignedJobIds,
        rowsById,
        jobIdToRowId
      );
      continue;
    }

    appendOrphanJob(job, assignedJobIds, rowsById, jobIdToRowId);
  }
}
