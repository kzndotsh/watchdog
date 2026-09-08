import { evidenceHint, evidenceTitle } from "@/domains/intake/lib/evidence";
import type {
  CollectRow,
  CollectRun,
  CollectRunRole,
  CollectState,
  EvidenceRecord,
} from "@/domains/intake/types";
import {
  jobActivityAt,
  summarizeJobInput,
  normalizedPlaybookRunId,
} from "@/domains/jobs/lib/status";
import type { JobListRecord } from "@/domains/jobs/types";
import { capabilityLabel, jobHeadlineLabel } from "@/shared/ui/vocab";
import {
  evidenceIdsFromJobInputs,
  isProcessCapability,
  normalizeUuidList,
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
  return normalizeUuidList(job.evidenceIds ?? []);
}

export function jobLinksEvidence(
  job: JobListRecord,
  evidenceId: string
): boolean {
  if (landedEvidenceIds(job).includes(evidenceId)) {
    return true;
  }
  const inputIds = evidenceIdsFromJobInputs([job.input]);
  if (!inputIds.includes(evidenceId)) {
    return false;
  }
  if (isProcessCapability(job.capabilityId)) {
    return true;
  }
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) {
    return true;
  }
  if (normalizedPlaybookRunId(job.playbookRunId) !== null) {
    return true;
  }
  return false;
}

export function isCollectCap(job: JobListRecord): boolean {
  if (normalizedPlaybookRunId(job.playbookRunId) !== null) return false;
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
      const landed = landedEvidenceIds(job);
      if (landed.length > 1) return false;
      return landed.includes(evidenceId);
    })
    .sort(
      (a, b) => Date.parse(jobActivityAt(b)) - Date.parse(jobActivityAt(a))
    );
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
    (a, b) =>
      Date.parse(jobActivityAt(b.job)) - Date.parse(jobActivityAt(a.job))
  );
}

export { jobActivityAt };

export function latestJobActivityAt(jobs: readonly JobListRecord[]): string {
  const first = jobs[0];
  if (first === undefined) return new Date(0).toISOString();
  let best = jobActivityAt(first);
  for (let i = 1; i < jobs.length; i += 1) {
    const row = jobs[i];
    if (row === undefined) continue;
    const at = jobActivityAt(row);
    if (Date.parse(at) >= Date.parse(best)) best = at;
  }
  return best;
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
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.some((status) => status === "queued")) return "queued";
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "cancelled")) return "cancelled";
  if (statuses.every((status) => status === "succeeded")) return "landed";
  return "queued";
}

function anchorJobSubject(
  input: JobListRecord["input"],
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): string | null {
  const hint = summarizeJobInput(input, evidenceTitleById, entityTitleById);
  return hint === "" ? null : hint;
}

function playbookStepHint(
  job: JobListRecord,
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): string {
  const stepNum = (job.playbookStep ?? 0) + 1;
  const cap = capabilityLabel(job.capabilityId);
  const subject = anchorJobSubject(
    job.input,
    evidenceTitleById,
    entityTitleById
  );
  const stepLabel = `Step ${stepNum} · ${cap}`;
  if (subject !== null) return `${stepLabel} — ${subject}`;
  return stepLabel;
}

export function rowTitle(
  evidence: EvidenceRecord | null,
  anchorJob: JobListRecord | null,
  opts?: {
    playbookTitle?: string | null;
    evidenceTitleById?: ReadonlyMap<string, string>;
    entityTitleById?: ReadonlyMap<string, string>;
  }
): string {
  if (evidence !== null) {
    return evidenceTitle(evidence);
  }
  if (
    anchorJob !== null &&
    normalizedPlaybookRunId(anchorJob.playbookRunId) !== null
  ) {
    return jobHeadlineLabel({
      capabilityId: anchorJob.capabilityId,
      playbookId: anchorJob.playbookId,
      playbookTitle: opts?.playbookTitle,
    });
  }
  if (anchorJob !== null) {
    const headline = jobHeadlineLabel(anchorJob);
    const subject = anchorJobSubject(
      anchorJob.input,
      opts?.evidenceTitleById,
      opts?.entityTitleById
    );
    if (subject !== null) {
      return `${headline} — ${subject}`;
    }
    return headline;
  }
  return "Item";
}

export function rowHint(
  evidence: EvidenceRecord | null,
  runs: readonly CollectRun[],
  producing: JobListRecord | null,
  opts?: {
    playbookTitle?: string | null;
    evidenceTitleById?: ReadonlyMap<string, string>;
    entityTitleById?: ReadonlyMap<string, string>;
  }
): string | null {
  if (evidence !== null) {
    const playbookJob = runs.find(
      (run) => normalizedPlaybookRunId(run.job.playbookRunId) !== null
    )?.job;
    if (playbookJob !== undefined) {
      return jobHeadlineLabel({
        capabilityId: playbookJob.capabilityId,
        playbookId: playbookJob.playbookId,
        playbookTitle: opts?.playbookTitle,
      });
    }
    return evidenceHint(evidence, producing);
  }
  const anchor = runs[0]?.job ?? null;
  if (anchor === null) return null;
  if (
    anchor !== null &&
    normalizedPlaybookRunId(anchor.playbookRunId) !== null
  ) {
    return playbookStepHint(
      anchor,
      opts?.evidenceTitleById,
      opts?.entityTitleById
    );
  }
  return jobHeadlineLabel(anchor);
}

export function buildEvidenceRow(
  evidence: EvidenceRecord,
  runs: readonly CollectRun[],
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): CollectRow {
  const producing = producingCollectJob(
    runs.map((run) => run.job),
    evidence.id
  );
  const rowOpts = { evidenceTitleById, entityTitleById };
  return {
    id: evidence.id,
    title: rowTitle(evidence, producing, rowOpts),
    hint: rowHint(evidence, runs, producing, rowOpts),
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
  jobs: readonly JobListRecord[],
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): CollectRow {
  const { runsByEvidenceId } = assignJobsToEvidence([evidence], jobs);
  const runs = sortRunsNewestFirst(runsByEvidenceId.get(evidence.id) ?? []);
  const titleMap =
    evidenceTitleById ?? new Map([[evidence.id, evidenceTitle(evidence)]]);
  return buildEvidenceRow(evidence, runs, titleMap, entityTitleById);
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
  if (row === null) return null;
  if (row.evidence !== null) {
    return producingCollectJob(
      row.runs.map((run) => run.job),
      row.evidence.id
    );
  }
  return jobsForRole(row, "collect")[0] ?? null;
}
