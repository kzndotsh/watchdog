import type { CollectRow, CollectRun } from "@/domains/collect/types";
import {
  rowHint,
  rowState,
  rowTitle,
} from "@/domains/intake/lib/evidence-runs";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/types";
import { parseTrimmedCaseId } from "@watchdog/schemas";

export {
  buildEvidenceRow,
  jobActivityAt,
  latestJobActivityAt,
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
    playbookTitle?: string | null;
    evidenceTitleById?: ReadonlyMap<string, string>;
    entityTitleById?: ReadonlyMap<string, string>;
  }
): CollectRow {
  const anchor = runs[0]?.job ?? null;
  const rowOpts = {
    playbookTitle: opts.playbookTitle,
    evidenceTitleById: opts.evidenceTitleById,
    entityTitleById: opts.entityTitleById,
  };
  return {
    id,
    title: rowTitle(opts.evidence, anchor, rowOpts),
    hint: rowHint(opts.evidence, runs, anchor, rowOpts),
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
  if (typeof input?.entityId !== "string") return null;
  return parseTrimmedCaseId(input.entityId);
}
