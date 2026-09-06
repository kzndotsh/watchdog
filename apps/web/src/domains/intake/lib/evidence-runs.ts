import { evidenceHint, evidenceTitle } from "@/domains/intake/lib/evidence";
import type {
  CollectRow,
  CollectRun,
  CollectRunRole,
  CollectState,
  EvidenceRecord,
} from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { capabilityLabel } from "@/shared/ui/vocab";
import {
  isProcessCapability,
  URL_ENRICH_CAPABILITY_ID,
} from "@watchdog/schemas";

export function classifyRun(job: JobListRecord): CollectRunRole {
  if (job.playbookStep !== null && job.playbookStep !== undefined) {
    return "step";
  }
  if (isProcessCapability(job.capabilityId)) {
    return "process";
  }
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) {
    return "enrich";
  }
  return "collect";
}

export function landedEvidenceIds(job: JobListRecord): readonly string[] {
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

export function jobLinksEvidence(
  job: JobListRecord,
  evidenceId: string
): boolean {
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

export function isCollectCap(job: JobListRecord): boolean {
  if (job.playbookRunId !== null && job.playbookRunId !== "") return false;
  if (isProcessCapability(job.capabilityId)) return false;
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) return false;
  return true;
}

export function producingCollectJob(
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

export function shouldStayStandaloneJob(job: JobListRecord): boolean {
  const landed = landedEvidenceIds(job);
  if (landed.length === 0) {
    return isCollectCap(job);
  }
  if (landed.length > 1) {
    return true;
  }
  return false;
}

export function sortRunsNewestFirst(runs: CollectRun[]): CollectRun[] {
  return [...runs].sort(
    (a, b) => Date.parse(b.job.createdAt) - Date.parse(a.job.createdAt)
  );
}

export function rowState(
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

export function rowTitle(
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

export function rowHint(
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

export function buildEvidenceRow(
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

/** Single-Evidence CollectRow join for Detail chrome (no queue index). */
export function collectRowForEvidence(
  evidence: EvidenceRecord,
  jobs: readonly JobListRecord[]
): CollectRow {
  const { runsByEvidenceId } = assignJobsToEvidence([evidence], jobs);
  const runs = sortRunsNewestFirst(runsByEvidenceId.get(evidence.id) ?? []);
  return buildEvidenceRow(evidence, runs);
}

export function jobsForRole(
  row: CollectRow | null,
  role: CollectRunRole
): JobListRecord[] {
  if (row === null) return [];
  const out: JobListRecord[] = [];
  for (const run of row.runs) {
    if (run.role === role) out.push(run.job);
  }
  return out;
}

export function producingCapFromRow(
  row: CollectRow | null
): JobListRecord | null {
  return jobsForRole(row, "collect")[0] ?? null;
}
