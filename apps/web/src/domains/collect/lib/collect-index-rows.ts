import type { CollectRow, CollectRun } from "@/domains/collect/types";
import {
  rowHint,
  rowState,
  rowTitle,
} from "@/domains/intake/lib/evidence-runs";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";

export {
  buildEvidenceRow,
  sortRunsNewestFirst,
} from "@/domains/intake/lib/evidence-runs";

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
