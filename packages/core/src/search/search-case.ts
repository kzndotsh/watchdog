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
} from "@watchdog/db";
import type {
  EntityKind,
  EvidenceKind,
  IdentifierType,
  JobStatus,
  TaskStatus,
} from "@watchdog/schemas";
import { SEARCH_MIN_QUERY_LENGTH } from "@watchdog/schemas";

import { assertCaseExistsEffect } from "../graph/patch/guards";
import { tryDb } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";

const DEFAULT_LIMIT = 24;
const DEFAULT_PER_GROUP = 8;

export interface SearchCaseOpts {
  caseId: string;
  q: string;
  limit?: number;
  perGroup?: number;
}

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
}

export interface SearchCaseTaskHit {
  id: string;
  title: string;
  status: TaskStatus;
  entityId: string | null;
}

export interface SearchCaseJobHit {
  id: string;
  capabilityId: string;
  status: JobStatus;
  resultSummary: string | null;
}

export interface SearchCaseProposalHit {
  id: string;
  summary: string | null;
  capabilityId: string | null;
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
  };
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

    yield* assertCaseExistsEffect(opts.caseId);

    const perGroup = Math.min(
      opts.perGroup ?? DEFAULT_PER_GROUP,
      opts.limit ?? DEFAULT_LIMIT
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
        tryDb(() => entitiesRepo.searchForCase(db, opts.caseId, q, perGroup)),
        tryDb(() =>
          identifiersRepo.searchForCase(db, opts.caseId, q, perGroup)
        ),
        tryDb(() => evidenceRepo.searchForCase(db, opts.caseId, q, perGroup)),
        tryDb(() => tasksRepo.searchForCase(db, opts.caseId, q, perGroup)),
        tryDb(() => jobsRepo.searchForCase(db, opts.caseId, q, perGroup)),
        tryDb(() =>
          proposalsRepo.searchPendingForCase(db, opts.caseId, q, perGroup)
        ),
        tryDb(() => casesRepo.search(db, q, perGroup)),
      ],
      { concurrency: "unbounded" }
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
        entityName: row.entityName,
        entitySlug: row.entitySlug,
      })),
      evidence: evidenceRows.map((row) => ({
        id: row.id,
        label: row.label,
        kind: row.kind,
      })),
      tasks: taskRows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        entityId: row.entityId,
      })),
      jobs: jobRows.map((row) => ({
        id: row.job.id,
        capabilityId: row.job.capabilityId,
        status: row.job.status,
        resultSummary: row.job.resultSummary,
      })),
      proposals: proposalRows.map((row) => ({
        id: row.proposal.id,
        summary: row.proposal.summary,
        capabilityId: row.capabilityId,
      })),
      cases: caseRows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
      })),
    };
  });
}
