import type { CollectRow, CollectRun } from "@/domains/collect/types";
import { PLAYBOOK_AGGREGATE_STATUS_PRIORITY } from "@watchdog/schemas";

const OPEN_STEP_STATUS_PRIORITY = PLAYBOOK_AGGREGATE_STATUS_PRIORITY.slice(
  0,
  3
);

function firstPlaybookId(row: CollectRow): string | undefined {
  for (const run of row.runs) {
    const playbookId = run.job.playbookId;
    if (playbookId !== null && playbookId !== "") return playbookId;
  }
  return undefined;
}

/** Recipe step count for collect job detail (prefers row recipe, then catalog). */
export function resolveCollectRecipeTotal(
  row: CollectRow | null,
  recipeStepCountByPlaybookId?: ReadonlyMap<string, number>
): number | undefined {
  if (row === null || row.evidence !== null) return undefined;
  if (row.recipe !== null) return row.recipe.total;
  const playbookId = firstPlaybookId(row);
  if (playbookId === undefined) return undefined;
  return recipeStepCountByPlaybookId?.get(playbookId);
}

function currentOpenRunJobId(runs: readonly CollectRun[]): string | null {
  for (const status of OPEN_STEP_STATUS_PRIORITY) {
    const run = runs.find((entry) => entry.job.status === status);
    if (run !== undefined) return run.job.id;
  }
  return runs[0]?.job.id ?? null;
}

/** Job id whose detail `CollectDetail` loads when the row is job-only (no evidence). */
export function resolveCollectJobDetailId(
  row: CollectRow | null,
  focusRunId: string | null
): string | null {
  if (row === null || row.evidence !== null) return null;
  return focusRunId ?? currentOpenRunJobId(row.runs);
}
