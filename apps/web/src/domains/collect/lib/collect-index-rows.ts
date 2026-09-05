import type {
  CollectRow,
  CollectRun,
  CollectState,
} from "@/domains/collect/types";
import { evidenceHint, evidenceTitle } from "@/domains/intake/lib/evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { capabilityLabel } from "@/shared/ui/vocab";

import { producingCollectJob } from "./collect-index-jobs";

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

export function buildJobRow(
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

export function entityIdFromJobInput(
  input: JobListRecord["input"]
): string | null {
  return typeof input.entityId === "string" ? input.entityId : null;
}
