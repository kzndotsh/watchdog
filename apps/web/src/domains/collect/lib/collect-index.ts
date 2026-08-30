import type {
  CollectIndex,
  CollectRow,
  CollectRun,
  CollectRunRole,
  CollectState,
} from "@/domains/collect/types";
import { evidenceHint, evidenceTitle } from "@/domains/intake/lib/evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import {
  groupJobsForQueue,
  playbookRunProgress,
  playbookRunStatus,
} from "@/domains/jobs/lib/status";
import { capabilityLabel } from "@/shared/ui/vocab";
import {
  isOpenJobStatus,
  isProcessCapability,
  URL_ENRICH_CAPABILITY_ID,
} from "@watchdog/schemas";

export interface BuildCollectIndexOptions {
  readonly recipeStepsByPlaybookId?: ReadonlyMap<string, number>;
}

function classifyRun(
  job: JobListRecord,
  evidenceId: string | null
): CollectRunRole {
  if (job.playbookStep !== null && job.playbookStep !== undefined) {
    return "step";
  }
  if (isProcessCapability(job.capabilityId)) {
    return "process";
  }
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) {
    return "enrich";
  }
  if (evidenceId !== null && (job.evidenceIds?.length ?? 0) > 1) {
    return "collect";
  }
  return "collect";
}

function landedEvidenceIds(job: JobListRecord): readonly string[] {
  return job.evidenceIds ?? [];
}

function jobInputEvidenceId(job: JobListRecord): string | null {
  const evidenceId = job.input.evidenceId;
  if (typeof evidenceId === "string" && evidenceId !== "") {
    return evidenceId;
  }
  const sourceEvidenceId = job.input.sourceEvidenceId;
  if (typeof sourceEvidenceId === "string" && sourceEvidenceId !== "") {
    return sourceEvidenceId;
  }
  return null;
}

function jobLinksEvidence(job: JobListRecord, evidenceId: string): boolean {
  if (job.evidenceIds?.includes(evidenceId) === true) {
    return true;
  }
  if (isProcessCapability(job.capabilityId)) {
    return job.input.evidenceId === evidenceId;
  }
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) {
    return job.input.sourceEvidenceId === evidenceId;
  }
  const inputEvidenceId = jobInputEvidenceId(job);
  if (
    job.playbookRunId !== null &&
    job.playbookRunId !== "" &&
    inputEvidenceId === evidenceId
  ) {
    return true;
  }
  return false;
}

function isCollectCap(job: JobListRecord): boolean {
  if (job.playbookRunId !== null && job.playbookRunId !== "") return false;
  if (isProcessCapability(job.capabilityId)) return false;
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) return false;
  return true;
}

function producingCollectJob(
  jobs: readonly JobListRecord[],
  evidenceId: string
): JobListRecord | null {
  const matches = jobs
    .filter((job) => {
      if (!isCollectCap(job)) return false;
      if ((job.evidenceIds?.length ?? 0) > 1) return false;
      return job.evidenceIds?.includes(evidenceId) === true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return matches[0] ?? null;
}

function sortRunsNewestFirst(runs: CollectRun[]): CollectRun[] {
  return [...runs].sort(
    (a, b) => Date.parse(b.job.createdAt) - Date.parse(a.job.createdAt)
  );
}

function rowState(
  evidence: EvidenceRecord | null,
  runs: readonly CollectRun[]
): CollectState {
  if (evidence !== null && evidence.deletedAt !== null) {
    return "hidden";
  }
  if (evidence !== null) {
    return evidence.processedAt === null ? "unprocessed" : "landed";
  }
  const statuses = runs.map((run) => run.job.status);
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.some((status) => status === "queued" || status === "blocked")) {
    return "queued";
  }
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "cancelled")) return "failed";
  if (statuses.every((status) => status === "succeeded")) return "landed";
  return "queued";
}

function anchorJobHost(input: JobListRecord["input"]): string | null {
  if (typeof input.host === "string" && input.host !== "") {
    return input.host;
  }
  if (typeof input.url === "string" && input.url !== "") {
    return input.url;
  }
  if (typeof input.query === "string" && input.query !== "") {
    return input.query;
  }
  return null;
}

function rowTitle(
  evidence: EvidenceRecord | null,
  anchorJob: JobListRecord | null
): string {
  if (evidence !== null) {
    return evidenceTitle(evidence);
  }
  if (anchorJob?.playbookRunId) {
    const playbookId = anchorJob.playbookId ?? "playbook";
    return playbookId;
  }
  if (anchorJob !== null) {
    const capLabel = capabilityLabel(anchorJob.capabilityId);
    const host = anchorJobHost(anchorJob.input);
    if (host !== null) {
      return `${capLabel} — ${host}`;
    }
    return capLabel;
  }
  return "Item";
}

function rowHint(
  evidence: EvidenceRecord | null,
  runs: readonly CollectRun[],
  producing: JobListRecord | null
): string | null {
  if (evidence !== null) {
    return evidenceHint(evidence, producing);
  }
  const anchor = runs[0]?.job ?? null;
  if (anchor === null) return null;
  if (anchor.playbookRunId) {
    return anchor.playbookId ?? "playbook";
  }
  return capabilityLabel(anchor.capabilityId);
}

function buildEvidenceRow(
  evidence: EvidenceRecord,
  runs: readonly CollectRun[]
): CollectRow {
  const producing = producingCollectJob(
    runs.map((run) => run.job),
    evidence.id
  );
  return {
    id: evidence.id,
    title: rowTitle(evidence, producing),
    hint: rowHint(evidence, runs, producing),
    state: rowState(evidence, runs),
    when: evidence.capturedAt,
    entityId: evidence.entityId,
    evidence,
    runs,
    playbookRunId: null,
    recipe: null,
  };
}

function buildJobRow(
  id: string,
  runs: readonly CollectRun[],
  opts: {
    evidence: EvidenceRecord | null;
    when: string;
    entityId: string | null;
    playbookRunId: string | null;
    recipe: CollectRow["recipe"];
  }
): CollectRow {
  const anchor = runs[0]?.job ?? null;
  return {
    id,
    title: rowTitle(opts.evidence, anchor),
    hint: rowHint(opts.evidence, runs, anchor),
    state: rowState(opts.evidence, runs),
    when: opts.when,
    entityId: opts.entityId,
    evidence: opts.evidence,
    runs,
    playbookRunId: opts.playbookRunId,
    recipe: opts.recipe,
  };
}

function shouldStayStandaloneJob(job: JobListRecord): boolean {
  const landed = landedEvidenceIds(job);
  if (landed.length === 0) {
    return isCollectCap(job);
  }
  if (landed.length > 1) {
    return true;
  }
  return false;
}

export function buildCollectIndex(
  evidence: readonly EvidenceRecord[],
  jobs: readonly JobListRecord[],
  opts?: BuildCollectIndexOptions
): CollectIndex {
  const evidenceById = new Map<string, EvidenceRecord>();
  const titleForEvidenceMap = new Map<string, string>();
  for (const row of evidence) {
    evidenceById.set(row.id, row);
    titleForEvidenceMap.set(row.id, evidenceTitle(row));
  }

  const assignedJobIds = new Set<string>();
  const rowsById = new Map<string, CollectRow>();
  const jobIdToRowId = new Map<string, string>();

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
      bucket.push({ job, role: classifyRun(job, row.id) });
      assignedJobIds.add(job.id);
    }
  }

  for (const row of evidence) {
    const runs = sortRunsNewestFirst(runsByEvidenceId.get(row.id) ?? []);
    const collectRow = buildEvidenceRow(row, runs);
    rowsById.set(row.id, collectRow);
    jobIdToRowId.set(row.id, row.id);
    for (const run of runs) {
      jobIdToRowId.set(run.job.id, row.id);
    }
  }

  const unassigned = jobs.filter((job) => !assignedJobIds.has(job.id));
  const grouped = groupJobsForQueue(unassigned);

  for (const entry of grouped) {
    if (entry.kind === "playbook") {
      const steps = entry.steps;
      const runs: CollectRun[] = steps.map((job) => ({
        job,
        role: "step" as const,
      }));
      const recipeTotal =
        opts?.recipeStepsByPlaybookId?.get(entry.playbookId) ?? steps.length;
      const progress = playbookRunProgress(
        steps,
        recipeTotal,
        entry.playbookRunStatus
      );
      const status = playbookRunStatus(
        steps,
        recipeTotal,
        entry.playbookRunStatus
      );
      const anchor = steps[0];
      if (anchor === undefined) continue;
      for (const step of steps) {
        assignedJobIds.add(step.id);
      }
      const row = buildJobRow(entry.runId, sortRunsNewestFirst(runs), {
        evidence: null,
        when: anchor.createdAt,
        entityId:
          typeof anchor.input.entityId === "string"
            ? anchor.input.entityId
            : null,
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
      continue;
    }

    const job = entry.job;
    if (shouldStayStandaloneJob(job)) {
      const landed = landedEvidenceIds(job);
      const runs: CollectRun[] = [
        { job, role: classifyRun(job, landed[0] ?? null) },
      ];
      assignedJobIds.add(job.id);
      const row = buildJobRow(job.id, runs, {
        evidence:
          landed.length === 1
            ? (evidenceById.get(landed[0] ?? "") ?? null)
            : null,
        when: job.createdAt,
        entityId:
          typeof job.input.entityId === "string" ? job.input.entityId : null,
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
      continue;
    }

    if (assignedJobIds.has(job.id)) continue;
    const runs: CollectRun[] = [{ job, role: classifyRun(job, null) }];
    assignedJobIds.add(job.id);
    const row = buildJobRow(job.id, runs, {
      evidence: null,
      when: job.createdAt,
      entityId:
        typeof job.input.entityId === "string" ? job.input.entityId : null,
      playbookRunId: job.playbookRunId,
      recipe: null,
    });
    rowsById.set(job.id, row);
    jobIdToRowId.set(job.id, job.id);
  }

  const rows = [...rowsById.values()].sort(
    (a, b) => Date.parse(b.when) - Date.parse(a.when)
  );

  return {
    rows,
    rowById(id: string): CollectRow | null {
      const mapped = jobIdToRowId.get(id) ?? id;
      return rowsById.get(mapped) ?? null;
    },
    titleForEvidence(evidenceId: string): string | null {
      return titleForEvidenceMap.get(evidenceId) ?? null;
    },
  };
}

export function jobsForRole(
  row: CollectRow | null,
  role: CollectRunRole
): JobListRecord[] {
  if (row === null) return [];
  return row.runs.filter((run) => run.role === role).map((run) => run.job);
}

export function producingCapFromRow(
  row: CollectRow | null
): JobListRecord | null {
  return jobsForRole(row, "collect")[0] ?? null;
}
