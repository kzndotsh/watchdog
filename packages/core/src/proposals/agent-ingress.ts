import { Effect } from "effect";

import { graphWritesRepo, type DbExec, type GraphWriteRow } from "@watchdog/db";
import {
  trimmedOrNull,
  type CaseId,
  type OrganizationId,
  type Page,
  type GraphActor,
} from "@watchdog/schemas/shared";

import { actorLabelForPersist } from "../actors/actor-label-snapshot";
import { requireActorIdEffect } from "../actors/require-actor-id";
import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import {
  assertEvidenceIdsInCaseEffect,
  createAttestationEffect,
} from "../evidence/evidence";
import { setHistoryContextEffect } from "../graph/graph-activity";
import { applyPatchEffect } from "../graph/patch/apply-patch";
import { assertCaseInOrgEffect } from "../graph/patch/guards";
import { parseAgentPatchEffect } from "../graph/patch/parse-agent-patch";
import type { Db } from "../infra/db-service";
import { pageWindow, toPage } from "../infra/page";
import type { PageRequest } from "../infra/page";
import { tryDb, tryDbWith, requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  InternalError,
  InvalidError,
  type DomainTag,
} from "../infra/tagged-errors";
import { suppressAndProposeStageEffect } from "../jobs/stages/propose";
import { getProposalForCaseEffect, type ProposalRecord } from "./proposals";

export type GraphWriteRecord = {
  id: string;
  caseId: CaseId;
  actorId: string;
  actorLabel: string;
  channel: GraphWriteRow["channel"];
  userOverridden: boolean;
  confidence: GraphWriteRow["confidence"];
  summary: string | null;
  createdAt: string;
};

/** One page of the Case's agent graph writes, newest first. */
export function listGraphWritesForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  page: PageRequest = {}
): Effect.Effect<Page<GraphWriteRecord>, DomainTag, Db> {
  return Effect.gen(function* listGraphWritesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const window = yield* pageWindow(page, {
      list: "graph-writes",
      keys: ["time"],
    });
    const found = yield* tryDbWith((exec) =>
      graphWritesRepo.listForCase(exec, scopedCaseId, {
        limit: window.limit + 1,
        ...(window.after === undefined ? {} : { after: window.after }),
      })
    );
    const users = yield* loadActorUsersEffect(
      found.slice(0, window.limit).map((row) => row.actorId)
    );
    return toPage(
      found,
      window,
      (row) => ({
        id: row.id,
        caseId: row.caseId,
        actorId: row.actorId,
        actorLabel: labelForActor(row.actorId, users, row.actorLabel),
        channel: row.channel,
        userOverridden: row.userOverridden,
        confidence: row.confidence,
        summary: row.summary,
        createdAt: row.createdAt.toISOString(),
      }),
      (row) => ({ id: row.id, values: [row.keyTime] })
    );
  });
}

const GRAPH_WRITE_IDEMPOTENCY_INDEX = "graph_writes_case_actor_idem_uidx";

function findGraphWriteByIdempotency(
  exec: DbExec,
  input: {
    caseId: CaseId;
    actorId: string;
    idempotencyKey: string;
  }
): Promise<string | null> {
  return graphWritesRepo.findIdByIdempotency(exec, input);
}

export type AgentGraphWriteResult = {
  writeId: string;
  confidence: "unverified";
  opCount: number;
  replayed: boolean;
  actorLabel: string;
};

export function createAgentProposalEffect(input: {
  caseId: CaseId;
  organizationId: OrganizationId;
  actorId: string;
  patch: unknown;
  summary?: string;
  evidenceIds?: string[];
}): Effect.Effect<{ proposal: ProposalRecord }, DomainTag, Db> {
  return Effect.gen(function* createAgentProposalGen() {
    const actorId = yield* requireActorIdEffect(input.actorId);
    const plan = yield* parseAgentPatchEffect({
      patch: input.patch,
      summary: input.summary,
      evidenceIds: input.evidenceIds,
    });
    if (!plan.ok) {
      return yield* new InvalidError({ reason: plan.error });
    }

    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    yield* assertEvidenceIdsInCaseEffect(scopedCaseId, plan.evidenceIds);

    const proposed = yield* suppressAndProposeStageEffect({
      caseId: scopedCaseId,
      patch: plan.patch,
      resultSummary: plan.summary,
      attachEvidenceIds: plan.evidenceIds,
      agentSourced: true,
      createdBy: actorId,
    });

    if (proposed.kept.length === 0) {
      if (proposed.suppressedCount > 0) {
        return yield* new ConflictError({
          reason: `All ${proposed.suppressedCount} finding(s) already known or previously rejected — no Proposal`,
        });
      }
      return yield* new InvalidError({ reason: "patch produced no findings" });
    }

    const proposalId = yield* Effect.succeed(
      proposed.proposalId === "" ? null : proposed.proposalId
    ).pipe(requireWritten("create Proposal"));

    const proposal = yield* getProposalForCaseEffect(scopedCaseId, proposalId);
    if (!proposal) {
      // Created a moment ago in this request: a miss is a server fault, not a 404.
      return yield* new InternalError({
        reason: "Proposal created but not readable",
      });
    }
    return { proposal };
  });
}

export function writeGraphFromAgentEffect(input: {
  caseId: CaseId;
  organizationId: OrganizationId;
  actorId: string;
  actorLabel?: string | null;
  /** The API key (`apikey.id`) that made the write; recorded on the history rows and activity entries. */
  actorKeyId?: string | null;
  patch: unknown;
  summary?: string;
  evidenceIds?: string[];
  userOverride: true;
  idempotencyKey?: string;
}): Effect.Effect<AgentGraphWriteResult, DomainTag, Db> {
  return Effect.gen(function* writeGraphFromAgentGen() {
    if (!input.userOverride) {
      return yield* new InvalidError({
        reason: "userOverride must be true for graph write",
      });
    }

    const actorId = yield* requireActorIdEffect(input.actorId);
    const users = yield* loadActorUsersEffect([actorId]);
    const actorLabel = labelForActor(actorId, users, input.actorLabel);
    // The history keeps the key's own label; the activity entries carry the display label.
    const actor: GraphActor = {
      actorId,
      actorLabel,
      actorKeyId: input.actorKeyId ?? undefined,
    };

    const plan = yield* parseAgentPatchEffect({
      patch: input.patch,
      summary: input.summary,
      evidenceIds: input.evidenceIds,
    });
    if (!plan.ok) {
      return yield* new InvalidError({ reason: plan.error });
    }

    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    yield* assertEvidenceIdsInCaseEffect(scopedCaseId, plan.evidenceIds);

    const idempotencyKey = trimmedOrNull(input.idempotencyKey);
    if (idempotencyKey !== null) {
      const existingId = yield* tryDbWith((exec) =>
        findGraphWriteByIdempotency(exec, {
          caseId: scopedCaseId,
          actorId,
          idempotencyKey,
        })
      );
      if (existingId !== null && existingId !== "") {
        return {
          writeId: existingId,
          confidence: "unverified" as const,
          opCount: 0,
          replayed: true,
          actorLabel,
        };
      }
    }

    const result = yield* transact(
      (tx) =>
        Effect.gen(function* writeGraphTx() {
          yield* setHistoryContextEffect(tx, {
            ...actor,
            actorLabel: actorLabelForPersist(input.actorLabel) ?? undefined,
            channel: "agent_write",
          });
          const sharedEvidenceIds = [...plan.evidenceIds];

          if (plan.summary !== null && plan.summary !== "") {
            const attestation = yield* createAttestationEffect({
              caseId: scopedCaseId,
              text: plan.summary,
              actorId,
              label: "Agent graph write",
              tx,
            });
            sharedEvidenceIds.push(attestation.id);
          }

          const write = yield* tryDb(() =>
            graphWritesRepo.create(tx, {
              caseId: scopedCaseId,
              actorId,
              actorLabel: actorLabelForPersist(input.actorLabel),
              channel: "agent_write",
              userOverridden: true,
              confidence: "unverified",
              summary: plan.summary,
              patch: plan.patch,
              idempotencyKey,
            })
          ).pipe(requireWritten("record graph write"));

          yield* applyPatchEffect({
            caseId: scopedCaseId,
            patch: plan.patch,
            confidence: "unverified",
            sharedEvidenceIds,
            actor,
            channel: "agent_write",
            tx,
          });

          return write.id;
        }),
      {
        uniqueIndex: GRAPH_WRITE_IDEMPOTENCY_INDEX,
        conflictReason: "graph write already recorded",
      }
    ).pipe(
      Effect.map((writeId) => ({
        writeId,
        confidence: "unverified" as const,
        opCount: plan.patch.length,
        replayed: false,
        actorLabel,
      })),
      Effect.catchTag("ConflictError", (conflict) =>
        Effect.gen(function* replayGraphWriteGen() {
          // Not a replay: surface the caller-visible conflict (e.g. an id or
          // slug already in use) instead of masking it as a failed write.
          if (idempotencyKey === null) {
            return yield* conflict;
          }
          const existingId = yield* tryDbWith((exec) =>
            findGraphWriteByIdempotency(exec, {
              caseId: scopedCaseId,
              actorId,
              idempotencyKey,
            })
          );
          if (existingId !== null && existingId !== "") {
            return {
              writeId: existingId,
              confidence: "unverified" as const,
              opCount: 0,
              replayed: true,
              actorLabel,
            };
          }
          return yield* conflict;
        })
      )
    );

    return result;
  });
}
