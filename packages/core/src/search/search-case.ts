import { Effect } from "effect";

import {
  casesRepo,
  db,
  entitiesRepo,
  evidenceRepo,
  identifiersRepo,
  jobsRepo,
  proposalsRepo,
  tasksRepo,
  type JobListRow,
  type JobWithPlaybook,
  type ProposalWithCapability,
} from "@watchdog/db";
import type {
  EntityKind,
  EvidenceKind,
  IdentifierType,
  JobStatus,
  JsonObject,
  TaskPriority,
  TaskStatus,
} from "@watchdog/schemas";
import {
  entityDisplayLabel,
  entityIdsFromJobInputs,
  entityTitleMapForJobInputs,
  evidenceIdsFromJobInputs,
  evidenceTitleMapForJobInputs,
  pickPlaybookAggregateStatus,
  parseTrimmedCaseId,
  proposalEntityName,
  SEARCH_MIN_QUERY_LENGTH,
} from "@watchdog/schemas";

import { getCaseByIdEffect } from "../cases/cases";
import {
  entityIdsFromNullable,
  entityIdsFromPatches,
  entityNameForId,
  loadEntityDisplayMapsForIds,
} from "../entities/entity-display";
import { tryDb } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";

const DEFAULT_PER_GROUP = 8;

export interface SearchCaseOpts {
  caseId: string;
  organizationId: string;
  q: string;
  limit?: number;
  perGroup?: number;
}

const MAX_SEARCH_PER_GROUP = 50;

export interface SearchCaseEntityHit {
  id: string;
  name: string;
  slug: string;
  kind: EntityKind;
}

export interface SearchCaseIdentifierHit {
  id: string;
  type: IdentifierType;
  platform: string;
  value: string;
  entityId: string;
  entityName: string;
  entitySlug: string;
}

export interface SearchCaseEvidenceHit {
  id: string;
  label: string | null;
  kind: EvidenceKind;
  sourceUrl: string | null;
  entityName: string | null;
}

export interface SearchCaseTaskHit {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  entityId: string | null;
  entityName: string | null;
}

export interface SearchCaseJobHit {
  id: string;
  capabilityId: string;
  status: JobStatus;
  resultSummary: string | null;
  input: JsonObject;
  playbookId: string | null;
}

export interface SearchCaseProposalHit {
  id: string;
  summary: string | null;
  capabilityId: string | null;
  playbookId: string | null;
  entityName: string | null;
}

export interface SearchCaseCaseHit {
  id: string;
  name: string;
  slug: string;
}

export interface SearchCaseResult {
  q: string;
  entities: SearchCaseEntityHit[];
  identifiers: SearchCaseIdentifierHit[];
  evidence: SearchCaseEvidenceHit[];
  tasks: SearchCaseTaskHit[];
  jobs: SearchCaseJobHit[];
  proposals: SearchCaseProposalHit[];
  cases: SearchCaseCaseHit[];
  evidenceLabels: Record<string, string>;
  entityLabels: Record<string, string>;
}

function emptyResult(q: string): SearchCaseResult {
  return {
    q,
    entities: [],
    identifiers: [],
    evidence: [],
    tasks: [],
    jobs: [],
    proposals: [],
    cases: [],
    evidenceLabels: {},
    entityLabels: {},
  };
}

function mapSearchJobHit(row: JobWithPlaybook<JobListRow>): SearchCaseJobHit {
  return {
    id: row.job.id,
    capabilityId: row.job.capabilityId,
    status: row.job.status,
    resultSummary: row.job.resultSummary,
    input: row.job.input,
    playbookId: row.playbookId,
  };
}

function pickSearchJobResultSummary(
  steps: readonly JobWithPlaybook<JobListRow>[]
): string | null {
  const ordered = [...steps].sort(
    (a, b) => b.job.updatedAt.getTime() - a.job.updatedAt.getTime()
  );
  for (const step of ordered) {
    const summary = step.job.resultSummary?.trim();
    if (summary) return summary;
  }
  return null;
}

function collapsePlaybookRunId(runId: string | null): string | undefined {
  if (runId === null) return undefined;
  return parseTrimmedCaseId(runId) ?? undefined;
}

/** Collapse playbook step rows into one search hit per run. */
export function collapseSearchJobHits(
  rows: readonly JobWithPlaybook<JobListRow>[]
): SearchCaseJobHit[] {
  const solo: SearchCaseJobHit[] = [];
  const byRun = new Map<string, JobWithPlaybook<JobListRow>[]>();

  for (const row of rows) {
    const runId = collapsePlaybookRunId(row.job.playbookRunId);
    if (runId === undefined) {
      solo.push(mapSearchJobHit(row));
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
      if (step !== undefined && step.job.updatedAt >= latest.job.updatedAt) {
        latest = step;
      }
    }
    const seed =
      [...steps].sort(
        (a, b) => (a.job.playbookStep ?? 0) - (b.job.playbookStep ?? 0)
      )[0] ?? latest;
    collapsed.push({
      id: runId,
      capabilityId: seed.job.capabilityId,
      status: pickPlaybookAggregateStatus(steps.map((step) => step.job.status)),
      resultSummary: pickSearchJobResultSummary(steps),
      input: seed.job.input,
      playbookId: seed.playbookId,
    });
  }

  return collapsed;
}

function entityIdsForSearchHits(
  proposalRows: readonly ProposalWithCapability[],
  taskRows: readonly { entityId: string | null }[],
  evidenceRows: readonly { entityId: string | null }[],
  jobRows: readonly JobWithPlaybook<JobListRow>[]
): string[] {
  const ids = new Set<string>([
    ...entityIdsFromPatches(
      proposalRows.map((row) => ({ patch: row.proposal.patch }))
    ),
    ...entityIdsFromNullable(taskRows.map((row) => row.entityId)),
    ...entityIdsFromNullable(evidenceRows.map((row) => row.entityId)),
    ...entityIdsFromJobInputs(jobRows.map((row) => row.job.input)),
  ]);
  return [...ids];
}

/** Active-Case graph search + Cases switch hits (ilike). */
export function searchCaseEffect(
  opts: SearchCaseOpts
): Effect.Effect<SearchCaseResult, DomainTag> {
  return Effect.gen(function* searchCaseGen() {
    const q = opts.q.trim();
    if (q.length < SEARCH_MIN_QUERY_LENGTH) {
      return emptyResult(q);
    }

    const caseRow = yield* getCaseByIdEffect(opts.caseId, opts.organizationId);
    const scopedCaseId = caseRow.id;

    const perGroup = Math.min(
      opts.perGroup ?? opts.limit ?? DEFAULT_PER_GROUP,
      MAX_SEARCH_PER_GROUP
    );

    const [
      entityRows,
      identifierRows,
      evidenceRows,
      taskRows,
      jobRows,
      proposalRows,
      caseRows,
    ] = yield* Effect.all(
      [
        tryDb(() => entitiesRepo.searchForCase(db, scopedCaseId, q, perGroup)),
        tryDb(() =>
          identifiersRepo.searchForCase(db, scopedCaseId, q, perGroup)
        ),
        tryDb(() => evidenceRepo.searchForCase(db, scopedCaseId, q, perGroup)),
        tryDb(() => tasksRepo.searchForCase(db, scopedCaseId, q, perGroup)),
        tryDb(() => jobsRepo.searchForCase(db, scopedCaseId, q, perGroup)),
        tryDb(() =>
          proposalsRepo.searchPendingForCase(db, scopedCaseId, q, perGroup)
        ),
        tryDb(() => casesRepo.search(db, opts.organizationId, q, perGroup)),
      ],
      { concurrency: "unbounded" }
    );

    const { entityNames, entitySlugs } = yield* tryDb(() =>
      loadEntityDisplayMapsForIds(
        scopedCaseId,
        entityIdsForSearchHits(proposalRows, taskRows, evidenceRows, jobRows)
      )
    );

    const jobInputs = jobRows.map((row) => row.job.input);
    const evidenceIds = evidenceIdsFromJobInputs(jobInputs);
    const evidenceLabelRows = yield* tryDb(() =>
      evidenceRepo.listActivityLabelsInCase(db, scopedCaseId, evidenceIds)
    );
    const evidenceLabels = Object.fromEntries(
      evidenceTitleMapForJobInputs(evidenceLabelRows, jobInputs)
    );

    const entityLabelRows = entityIdsFromJobInputs(jobInputs).map((id) => ({
      id,
      name: entityNames[id] ?? "",
      slug: entitySlugs[id] ?? "",
    }));
    const entityLabels = Object.fromEntries(
      entityTitleMapForJobInputs(entityLabelRows, jobInputs)
    );

    return {
      q,
      entities: entityRows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        kind: row.kind,
      })),
      identifiers: identifierRows.map((row) => ({
        id: row.id,
        type: row.type,
        platform: row.platform,
        value: row.value,
        entityId: row.entityId,
        entityName: entityDisplayLabel({
          name: row.entityName,
          slug: row.entitySlug,
        }),
        entitySlug: row.entitySlug,
      })),
      evidence: evidenceRows.map((row) => ({
        id: row.id,
        label: row.label,
        kind: row.kind,
        sourceUrl: row.sourceUrl,
        entityName: entityNameForId(row.entityId, entityNames),
      })),
      tasks: taskRows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        entityId: row.entityId,
        entityName: entityNameForId(row.entityId, entityNames),
      })),
      jobs: collapseSearchJobHits(jobRows),
      proposals: proposalRows.map((row) => ({
        id: row.proposal.id,
        summary: row.proposal.summary,
        capabilityId: row.capabilityId,
        playbookId: row.playbookId,
        entityName: proposalEntityName({
          patch: row.proposal.patch,
          entityNames,
          entitySlugs,
        }),
      })),
      cases: caseRows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
      })),
      evidenceLabels,
      entityLabels,
    };
  });
}
