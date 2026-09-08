import { Effect } from "effect";

import {
  activityEventsRepo,
  activityRepo,
  db,
  entitiesRepo,
  evidenceRepo,
  type RecentActivityEventRow,
  type RecentJobActivityRow,
} from "@watchdog/db";
import type { ActivityItem, ActivityKind, JobStatus } from "@watchdog/schemas";
import {
  entityIdsFromJobInputs,
  entityTitleMapForJobInputs,
  evidenceDisplayLabel,
  evidenceIdsFromJobInputs,
  evidenceTitleMapForJobInputs,
  pickPlaybookAggregateStatus,
  parseTrimmedCaseId,
} from "@watchdog/schemas";

import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import { loadEntityDisplayMapsForProposalPatches } from "../entities/entity-display";
import { assertCaseInOrgEffect } from "../graph/patch/guards";
import { tryDb } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";
import { jobActivityLabel } from "../jobs/job-display";
import { proposalActivityLabel } from "../proposals/proposal-display";

export type { ActivityItem, ActivityKind };

export interface ListRecentActivityOpts {
  organizationId: string;
  caseId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 15;
const PER_SOURCE_FETCH_CAP = 100;

function clampActivityLimit(value: number | undefined): number {
  const n = value ?? DEFAULT_LIMIT;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(n)), PER_SOURCE_FETCH_CAP);
}

function perSourceFetchLimit(limit: number): number {
  return Math.min(Math.max(limit * 4, limit), PER_SOURCE_FETCH_CAP);
}

export { clampActivityLimit, perSourceFetchLimit };

/** Map stored task event codes → display verb. */
export function taskEventAction(
  action: string,
  toValue: string | null
): string {
  if (action === "created") return "Created";
  if (action === "deleted") return "Deleted";
  if (action === "status_changed") {
    if (toValue === "done") return "Completed";
    if (toValue === "dropped") return "Dropped";
    return "Moved";
  }
  return "Updated";
}

/** Derive a verb from job lifecycle status. */
export function jobActivityAction(status: JobStatus): string {
  switch (status) {
    case "succeeded": {
      return "Succeeded";
    }
    case "failed": {
      return "Failed";
    }
    case "cancelled": {
      return "Cancelled";
    }
    case "running": {
      return "Running";
    }
    case "blocked": {
      return "Blocked";
    }
    case "queued": {
      return "Queued";
    }
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function mapTaskEvent(
  row: RecentActivityEventRow,
  users: ReadonlyMap<string, { name: string; email: string }>
): ActivityItem {
  return {
    id: row.id,
    kind: "task",
    action: taskEventAction(row.action, row.toValue),
    caseId: row.caseId,
    caseName: row.caseName,
    label: row.label,
    status: row.toValue ?? undefined,
    fromStatus: row.fromValue ?? undefined,
    toStatus: row.toValue ?? undefined,
    at: row.at.toISOString(),
    actor: row.actorId ? labelForActor(row.actorId, users) : undefined,
  };
}

function pickPlaybookResultSummary(
  steps: readonly RecentJobActivityRow[]
): string | null {
  const ordered = [...steps].sort((a, b) => b.at.getTime() - a.at.getTime());
  for (const step of ordered) {
    const summary = step.resultSummary?.trim();
    if (summary) return summary;
  }
  return null;
}

/** Collapse playbook step rows into one activity row per run. */
export function collapseRecentJobActivityRows(
  rows: RecentJobActivityRow[]
): RecentJobActivityRow[] {
  const solo: RecentJobActivityRow[] = [];
  const byRun = new Map<string, RecentJobActivityRow[]>();

  for (const row of rows) {
    const runId =
      row.playbookRunId === null ? null : parseTrimmedCaseId(row.playbookRunId);
    if (runId === null) {
      solo.push(row);
    } else {
      const bucket = byRun.get(runId) ?? [];
      bucket.push(row);
      byRun.set(runId, bucket);
    }
  }

  const collapsed = [...solo];
  for (const [runId, steps] of byRun) {
    const first = steps[0];
    if (first === undefined) continue;
    let latest = first;
    for (let i = 1; i < steps.length; i += 1) {
      const step = steps[i];
      if (step !== undefined && step.at >= latest.at) latest = step;
    }
    const seed =
      [...steps].sort(
        (a, b) => (a.playbookStep ?? 0) - (b.playbookStep ?? 0)
      )[0] ?? latest;
    collapsed.push({
      ...latest,
      id: runId,
      capabilityId: seed.capabilityId,
      status: pickPlaybookAggregateStatus(steps.map((step) => step.status)),
      input: seed.input,
      playbookId: seed.playbookId,
      resultSummary: pickPlaybookResultSummary(steps),
    });
  }

  return collapsed;
}

function evidenceIdsByCaseFromJobRows(
  rows: readonly RecentJobActivityRow[]
): Map<string, string[]> {
  const byCase = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const id of evidenceIdsFromJobInputs([row.input])) {
      const bucket = byCase.get(row.caseId) ?? new Set<string>();
      bucket.add(id);
      byCase.set(row.caseId, bucket);
    }
  }
  const out = new Map<string, string[]>();
  for (const [caseId, ids] of byCase) {
    out.set(caseId, [...ids]);
  }
  return out;
}

function entityIdsByCaseFromJobRows(
  rows: readonly RecentJobActivityRow[]
): Map<string, string[]> {
  const byCase = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const id of entityIdsFromJobInputs([row.input])) {
      const bucket = byCase.get(row.caseId) ?? new Set<string>();
      bucket.add(id);
      byCase.set(row.caseId, bucket);
    }
  }
  const out = new Map<string, string[]>();
  for (const [caseId, ids] of byCase) {
    out.set(caseId, [...ids]);
  }
  return out;
}

function loadEntityTitleMapEffect(
  rows: readonly RecentJobActivityRow[]
): Effect.Effect<ReadonlyMap<string, string>, DomainTag> {
  const byCase = entityIdsByCaseFromJobRows(rows);
  if (byCase.size === 0) {
    return Effect.succeed(new Map<string, string>());
  }
  return Effect.gen(function* loadEntityTitleMapGen() {
    const labels = new Map<string, string>();
    for (const [caseId, entityIds] of byCase) {
      const caseInputs = rows
        .filter((row) => row.caseId === caseId)
        .map((row) => row.input);
      const entityRows = yield* tryDb(() =>
        entitiesRepo.listNamesByIdsInCase(db, caseId, entityIds)
      );
      for (const [id, label] of entityTitleMapForJobInputs(
        entityRows,
        caseInputs
      )) {
        labels.set(id, label);
      }
    }
    return labels;
  });
}

function loadEvidenceTitleMapEffect(
  rows: readonly RecentJobActivityRow[]
): Effect.Effect<ReadonlyMap<string, string>, DomainTag> {
  const byCase = evidenceIdsByCaseFromJobRows(rows);
  if (byCase.size === 0) {
    return Effect.succeed(new Map<string, string>());
  }
  return Effect.gen(function* loadEvidenceTitleMapGen() {
    const labels = new Map<string, string>();
    for (const [caseId, evidenceIds] of byCase) {
      const caseInputs = rows
        .filter((row) => row.caseId === caseId)
        .map((row) => row.input);
      const evidenceRows = yield* tryDb(() =>
        evidenceRepo.listActivityLabelsInCase(db, caseId, evidenceIds)
      );
      for (const [id, title] of evidenceTitleMapForJobInputs(
        evidenceRows,
        caseInputs
      )) {
        labels.set(id, title);
      }
    }
    return labels;
  });
}

/** Pure merge/sort for unit tests — newer `at` first. */
export function mergeActivityItems(
  items: ActivityItem[],
  limit: number
): ActivityItem[] {
  return [...items]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export function listRecentActivityEffect(
  opts: ListRecentActivityOpts
): Effect.Effect<ActivityItem[], DomainTag> {
  const limit = clampActivityLimit(opts.limit);
  const fetchLimit = perSourceFetchLimit(limit);
  const scopedCaseFilter =
    opts.caseId === undefined ? undefined : parseTrimmedCaseId(opts.caseId);
  if (scopedCaseFilter === null) {
    return Effect.succeed([]);
  }

  return Effect.gen(function* listRecentActivityGen() {
    const scopedCaseId =
      scopedCaseFilter === undefined
        ? undefined
        : yield* assertCaseInOrgEffect(scopedCaseFilter, opts.organizationId);
    const repoOpts = {
      organizationId: opts.organizationId,
      caseId: scopedCaseId,
      limit: fetchLimit,
    };
    const [evidenceRows, jobRows, proposalRows, taskEvents] = yield* Effect.all(
      [
        tryDb(() => activityRepo.recentEvidence(db, repoOpts)),
        tryDb(() => activityRepo.recentJobs(db, repoOpts)),
        tryDb(() => activityRepo.recentPendingProposals(db, repoOpts)),
        tryDb(() =>
          activityEventsRepo.recent(db, { ...repoOpts, kind: "task" })
        ),
      ],
      { concurrency: "unbounded" }
    );

    const users = yield* loadActorUsersEffect([
      ...evidenceRows.map((row) => row.actorId),
      ...jobRows.map((row) => row.actorId),
      ...taskEvents.map((row) => row.actorId),
    ]);

    const {
      entityNames: proposalEntityNames,
      entitySlugs: proposalEntitySlugs,
    } = yield* tryDb(() =>
      loadEntityDisplayMapsForProposalPatches(
        proposalRows.map((row) => ({
          caseId: row.caseId,
          patch: row.patch,
        }))
      )
    );

    const collapsedJobRows = collapseRecentJobActivityRows(jobRows);
    const evidenceTitleById =
      yield* loadEvidenceTitleMapEffect(collapsedJobRows);
    const entityTitleById = yield* loadEntityTitleMapEffect(collapsedJobRows);

    const items: ActivityItem[] = [
      ...evidenceRows.map((row) => ({
        id: row.id,
        kind: "evidence" as const,
        action: "Captured",
        caseId: row.caseId,
        caseName: row.caseName,
        label: evidenceDisplayLabel({
          label: row.label,
          kind: row.kind,
          sourceUrl: row.sourceUrl,
        }),
        at: row.at.toISOString(),
        actor: labelForActor(row.actorId, users, row.actorLabel),
      })),
      ...collapsedJobRows.map((row) => ({
        id: row.id,
        kind: "job" as const,
        action: jobActivityAction(row.status),
        caseId: row.caseId,
        caseName: row.caseName,
        label: jobActivityLabel({
          capabilityId: row.capabilityId,
          resultSummary: row.resultSummary,
          input: row.input,
          playbookId: row.playbookId,
          evidenceTitleById,
          entityTitleById,
        }),
        status: row.status,
        at: row.at.toISOString(),
        actor: labelForActor(row.actorId, users, row.actorLabel),
      })),
      ...proposalRows.map((row) => ({
        id: row.id,
        kind: "proposal" as const,
        action: "Pending",
        caseId: row.caseId,
        caseName: row.caseName,
        label: proposalActivityLabel({
          summary: row.summary,
          capabilityId: row.capabilityId,
          playbookId: row.playbookId,
          patch: row.patch,
          entityNames: proposalEntityNames,
          entitySlugs: proposalEntitySlugs,
        }),
        status: "pending",
        at: row.at.toISOString(),
      })),
      ...taskEvents.map((row) => mapTaskEvent(row, users)),
    ];

    return mergeActivityItems(items, limit);
  });
}
