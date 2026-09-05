import type {
  CollectIndex,
  CollectRow,
  CollectRunRole,
} from "@/domains/collect/types";
import { evidenceTitle } from "@/domains/intake/lib/evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";

import {
  appendUnassignedJobRows,
  assignJobsToEvidence,
  seedEvidenceMaps,
  seedEvidenceRows,
} from "./collect-index-build";

export interface BuildCollectIndexOptions {
  readonly recipeStepsByPlaybookId?: ReadonlyMap<string, number>;
}

export function buildCollectIndex(
  evidence: readonly EvidenceRecord[],
  jobs: readonly JobListRecord[],
  opts?: BuildCollectIndexOptions
): CollectIndex {
  const { evidenceById, titleForEvidenceMap } = seedEvidenceMaps(
    evidence,
    evidenceTitle
  );
  const rowsById = new Map<string, CollectRow>();
  const jobIdToRowId = new Map<string, string>();

  const { runsByEvidenceId, assignedJobIds } = assignJobsToEvidence(
    evidence,
    jobs
  );
  seedEvidenceRows(evidence, runsByEvidenceId, rowsById, jobIdToRowId);
  appendUnassignedJobRows(
    jobs,
    assignedJobIds,
    evidenceById,
    rowsById,
    jobIdToRowId,
    opts?.recipeStepsByPlaybookId
  );

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
