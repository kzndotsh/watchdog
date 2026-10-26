import type { CollectRow, CollectRun } from "@/domains/collect/types";
import {
  buildEvidenceRow,
  classifyRun,
  rowHint,
  rowTitle,
  sortRunsNewestFirst,
} from "@/domains/intake/lib/evidence-runs";
import {
  playbookRunProgress,
  playbookRunStatus,
} from "@/domains/jobs/lib/status";
import type { CollectQueueItem, JobListRecord } from "@watchdog/core/jobs";
import { isOpenJobStatus, parseTrimmedUuid } from "@watchdog/schemas/shared";

/** What the Cap and playbook catalogs add to a row: a playbook's title and its recipe length. */
export type CollectCatalog = {
  readonly playbookTitleById: ReadonlyMap<string, string>;
  readonly recipeStepsByPlaybookId: ReadonlyMap<string, number>;
};

type CatalogPlaybook = {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly unknown[];
};

export function collectCatalogFromPlaybooks(
  playbooks: readonly CatalogPlaybook[]
): CollectCatalog {
  return {
    playbookTitleById: new Map(playbooks.map((p) => [p.id, p.title])),
    recipeStepsByPlaybookId: new Map(
      playbooks.map((p) => [p.id, p.steps.length])
    ),
  };
}

function entityIdFromJobInput(input: JobListRecord["input"]): string | null {
  if (typeof input?.entityId !== "string") return null;
  return parseTrimmedUuid(input.entityId);
}

function runsOf(jobs: readonly JobListRecord[]): CollectRun[] {
  return jobs.map((job) => ({ job, role: classifyRun(job) }));
}

function runRow(item: CollectQueueItem, catalog: CollectCatalog): CollectRow {
  const steps = [...item.jobs].sort(
    (a, b) => (a.playbookStep ?? 0) - (b.playbookStep ?? 0)
  );
  const anchor = steps[0];
  const runs = steps.map((job) => ({ job, role: "step" as const }));
  const playbookId =
    steps.find((job) => job.playbookId !== null && job.playbookId !== "")
      ?.playbookId ?? item.id;
  const total = catalog.recipeStepsByPlaybookId.get(playbookId) ?? steps.length;
  const runStatus = anchor?.playbookRunStatus ?? null;
  const progress = playbookRunProgress(steps, total, runStatus);
  const status = playbookRunStatus(steps, total, runStatus);
  const opts = {
    playbookTitle: catalog.playbookTitleById.get(playbookId) ?? null,
    evidenceTitleById: new Map(Object.entries(item.titles.evidence)),
    entityTitleById: new Map(Object.entries(item.titles.entity)),
  };
  const ordered = sortRunsNewestFirst(runs);
  return {
    id: item.id,
    title: rowTitle(null, anchor ?? null, opts),
    hint: rowHint(null, ordered, anchor ?? null, opts),
    state: item.state,
    when: item.activityAt,
    entityId: anchor === undefined ? null : entityIdFromJobInput(anchor.input),
    evidence: null,
    runs: ordered,
    playbookRunId: item.id,
    recipe: {
      step: progress.done + (isOpenJobStatus(status) ? 1 : 0),
      total: progress.total,
      outcome: anchor?.playbookRunOutcome ?? null,
    },
  };
}

function jobRow(item: CollectQueueItem, catalog: CollectCatalog): CollectRow {
  const runs = runsOf(item.jobs);
  const anchor = runs[0]?.job ?? null;
  const playbookId = anchor?.playbookId ?? null;
  const opts = {
    playbookTitle:
      playbookId === null || playbookId === ""
        ? null
        : (catalog.playbookTitleById.get(playbookId) ?? null),
    evidenceTitleById: new Map(Object.entries(item.titles.evidence)),
    entityTitleById: new Map(Object.entries(item.titles.entity)),
  };
  return {
    id: item.id,
    title: rowTitle(null, anchor, opts),
    hint: rowHint(null, runs, anchor, opts),
    state: item.state,
    when: item.activityAt,
    entityId: anchor === null ? null : entityIdFromJobInput(anchor.input),
    evidence: null,
    runs,
    playbookRunId: null,
    recipe: null,
  };
}

/**
 * A queue item as the screen's row: Evidence with its Jobs, a playbook run with its steps, or a
 * lone Job. The state, Jobs and titles are the server's (one snapshot); only the catalog's
 * playbook titles and recipe lengths are read here.
 */
export function collectRowOf(
  item: CollectQueueItem,
  catalog: CollectCatalog
): CollectRow {
  if (item.evidence !== null) {
    const evidenceTitleById = new Map(Object.entries(item.titles.evidence));
    const row = buildEvidenceRow(
      item.evidence,
      sortRunsNewestFirst(runsOf(item.jobs)),
      evidenceTitleById,
      new Map(Object.entries(item.titles.entity))
    );
    return { ...row, state: item.state };
  }
  return item.kind === "run" ? runRow(item, catalog) : jobRow(item, catalog);
}
