import type { CollectIndex, CollectRow } from "@/domains/collect/types";
import { evidenceTitle } from "@/domains/intake/lib/evidence";
import { assignJobsToEvidence } from "@/domains/intake/lib/evidence-runs";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/types";

import {
  appendUnassignedJobRows,
  seedEvidenceMaps,
  seedEvidenceRows,
} from "./collect-index-build";

export interface BuildCollectIndexOptions {
  readonly recipeStepsByPlaybookId?: ReadonlyMap<string, number>;
  readonly playbookTitleById?: ReadonlyMap<string, string>;
  /** Superset of titles for job row hints (e.g. includes hidden evidence). */
  readonly evidenceTitleById?: ReadonlyMap<string, string>;
  /** Entity display labels for job input subjects. */
  readonly entityTitleById?: ReadonlyMap<string, string>;
}

export interface PlaybookCatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly unknown[];
}

export function collectIndexOptionsFromPlaybooks(
  playbooks: readonly PlaybookCatalogEntry[]
): BuildCollectIndexOptions {
  const playbookTitleById = new Map<string, string>();
  const recipeStepsByPlaybookId = new Map<string, number>();
  for (const playbook of playbooks) {
    playbookTitleById.set(playbook.id, playbook.title);
    recipeStepsByPlaybookId.set(playbook.id, playbook.steps.length);
  }
  return { playbookTitleById, recipeStepsByPlaybookId };
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
