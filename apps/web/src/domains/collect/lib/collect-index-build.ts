import type { CollectRow, CollectRun } from "@/domains/collect/types";
import type { EvidenceRecord } from "@/domains/intake/types";
import {
  groupJobsForQueue,
  playbookRunProgress,
  playbookRunStatus,
  type JobQueueEntry,
} from "@/domains/jobs/lib/status";
import type { JobListRecord } from "@/domains/jobs/types";
import { isOpenJobStatus } from "@watchdog/schemas";

import {
  classifyRun,
  landedEvidenceIds,
  shouldStayStandaloneJob,
} from "./collect-index-jobs";
import {
  buildEvidenceRow,
  buildJobRow,
  entityIdFromJobInput,
  jobActivityAt,
  latestJobActivityAt,
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

export function seedEvidenceRows(
  evidence: readonly EvidenceRecord[],
  runsByEvidenceId: ReadonlyMap<string, CollectRun[]>,
  rowsById: Map<string, CollectRow>,
  jobIdToRowId: Map<string, string>,
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): void {
  for (const row of evidence) {
    const runs = sortRunsNewestFirst(runsByEvidenceId.get(row.id) ?? []);
    const collectRow = buildEvidenceRow(
      row,
      runs,
      evidenceTitleById,
      entityTitleById
    );
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
  playbookTitleById: ReadonlyMap<string, string> | undefined,
  evidenceTitleById: ReadonlyMap<string, string> | undefined,
  entityTitleById: ReadonlyMap<string, string> | undefined,
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
    when: latestJobActivityAt(steps),
    entityId: entityIdFromJobInput(anchor.input),
    playbookRunId: entry.runId,
    playbookTitle: playbookTitleById?.get(entry.playbookId) ?? null,
    evidenceTitleById,
    entityTitleById,
    recipe: {
      step: progress.done + (isOpenJobStatus(status) ? 1 : 0),
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
  evidenceTitleById: ReadonlyMap<string, string> | undefined,
  entityTitleById: ReadonlyMap<string, string> | undefined,
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
    when: jobActivityAt(job),
    entityId: entityIdFromJobInput(job.input),
    playbookRunId: null,
    evidenceTitleById,
    entityTitleById,
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
  jobIdToRowId: Map<string, string>,
  playbookTitleById?: ReadonlyMap<string, string>,
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): void {
  if (assignedJobIds.has(job.id)) return;
  const runs: CollectRun[] = [{ job, role: classifyRun(job) }];
  assignedJobIds.add(job.id);
  const row = buildJobRow(job.id, runs, {
    evidence: null,
    when: jobActivityAt(job),
    entityId: entityIdFromJobInput(job.input),
    playbookRunId: job.playbookRunId,
    playbookTitle:
      job.playbookId !== null && job.playbookId !== ""
        ? (playbookTitleById?.get(job.playbookId) ?? null)
        : null,
    evidenceTitleById,
    entityTitleById,
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
  recipeStepsByPlaybookId: ReadonlyMap<string, number> | undefined,
  playbookTitleById?: ReadonlyMap<string, string>,
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): void {
  const unassigned = jobs.filter((job) => !assignedJobIds.has(job.id));
  const grouped = groupJobsForQueue(unassigned);

  for (const entry of grouped) {
    if (entry.kind === "playbook") {
      appendPlaybookGroup(
        entry,
        recipeStepsByPlaybookId,
        playbookTitleById,
        evidenceTitleById,
        entityTitleById,
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
        evidenceTitleById,
        entityTitleById,
        assignedJobIds,
        rowsById,
        jobIdToRowId
      );
      continue;
    }

    appendOrphanJob(
      job,
      assignedJobIds,
      rowsById,
      jobIdToRowId,
      playbookTitleById,
      evidenceTitleById,
      entityTitleById
    );
  }
}
