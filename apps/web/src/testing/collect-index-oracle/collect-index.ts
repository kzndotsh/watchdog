import type { CollectRow } from "@/domains/collect/types";
import { evidenceTitle } from "@/domains/intake/lib/evidence";
import { assignJobsToEvidence } from "@/domains/intake/lib/evidence-runs";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@watchdog/core/jobs";

import {
  appendUnassignedJobRows,
  seedEvidenceMaps,
  seedEvidenceRows,
} from "./collect-index-build";

/** Today's queue builder over whole Evidence and Job lists, kept only as the oracle the reference is held to. */
export type CollectIndex = {
  readonly rows: readonly CollectRow[];
  readonly rowById: (id: string) => CollectRow | null;
  readonly titleForEvidence: (evidenceId: string) => string | null;
};

export type BuildCollectIndexOptions = {
  readonly recipeStepsByPlaybookId?: ReadonlyMap<string, number>;
  readonly playbookTitleById?: ReadonlyMap<string, string>;
  /** Superset of titles for job row hints (e.g. includes hidden evidence). */
  readonly evidenceTitleById?: ReadonlyMap<string, string>;
  /** Entity display labels for job input subjects. */
  readonly entityTitleById?: ReadonlyMap<string, string>;
};

export function buildCollectIndex(
  evidence: readonly EvidenceRecord[],
  jobs: readonly JobListRecord[],
  opts?: BuildCollectIndexOptions
): CollectIndex {
  const { evidenceById, titleForEvidenceMap } = seedEvidenceMaps(
    evidence,
    evidenceTitle
  );
  const evidenceTitles = opts?.evidenceTitleById ?? titleForEvidenceMap;
  const entityTitles = opts?.entityTitleById;
  const rowsById = new Map<string, CollectRow>();
  const jobIdToRowId = new Map<string, string>();

  const { runsByEvidenceId, assignedJobIds } = assignJobsToEvidence(
    evidence,
    jobs
  );
  seedEvidenceRows(
    evidence,
    runsByEvidenceId,
    rowsById,
    jobIdToRowId,
    evidenceTitles,
    entityTitles
  );
  appendUnassignedJobRows(
    jobs,
    assignedJobIds,
    evidenceById,
    rowsById,
    jobIdToRowId,
    opts?.recipeStepsByPlaybookId,
    opts?.playbookTitleById,
    evidenceTitles,
    entityTitles
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
      return evidenceTitles.get(evidenceId) ?? null;
    },
  };
}
