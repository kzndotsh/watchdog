import { Effect } from "effect";

import { db, graphWritesRepo, type GraphWriteRow } from "@watchdog/db";
import { trimmedOrNull } from "@watchdog/schemas";

import { requireActorIdEffect } from "../actors/require-actor-id";
import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import {
  assertEvidenceIdsInCaseEffect,
  createAttestationEffect,
} from "../evidence/evidence";
import { applyPatchEffect } from "../graph/patch/apply-patch";
import { assertCaseInOrgEffect } from "../graph/patch/guards";
import { parseAgentPatchEffect } from "../graph/patch/parse-agent-patch";
import {
  notifyEntityChangedEffect,
  notifyEvidenceChangedEffect,
  notifyProposalCreatedEffect,
} from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { suppressAndProposeStageEffect } from "../jobs/stages/propose";
import { getProposalForCaseEffect, type ProposalRecord } from "./proposals";

export interface GraphWriteRecord {
  id: string;
  caseId: string;
  actorId: string;
  actorLabel: string;
  channel: GraphWriteRow["channel"];
  userOverridden: boolean;
  confidence: GraphWriteRow["confidence"];
  summary: string | null;
  createdAt: string;
}

export function listGraphWritesForCaseEffect(
  caseId: string,
  organizationId: string
): Effect.Effect<GraphWriteRecord[], DomainTag> {
  return Effect.gen(function* listGraphWritesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() =>
      graphWritesRepo.listForCase(db, scopedCaseId)
    );
    const users = yield* loadActorUsersEffect(rows.map((row) => row.actorId));
    return rows.map((row) => ({
      id: row.id,
      caseId: row.caseId,
      actorId: row.actorId,
      actorLabel: labelForActor(row.actorId, users, row.actorLabel),
      channel: row.channel,
      userOverridden: row.userOverridden,
      confidence: row.confidence,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

const GRAPH_WRITE_IDEMPOTENCY_INDEX = "graph_writes_case_actor_idem_uidx";

function findGraphWriteByIdempotency(input: {
  caseId: string;
  actorId: string;
  idempotencyKey: string;
}): Promise<string | null> {
  return graphWritesRepo.findIdByIdempotency(db, input);
}

export interface AgentGraphWriteResult {
  writeId: string;
  confidence: "unverified";
  opCount: number;
  replayed: boolean;
  actorLabel: string;
}

export function createAgentProposalEffect(input: {
  caseId: string;
  organizationId: string;
  actorId: string;
  patch: unknown;
  summary?: string;
  evidenceIds?: string[];
}): Effect.Effect<{ proposal: ProposalRecord }, DomainTag> {
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

    if (proposed.proposalId === null || proposed.proposalId === "") {
      return yield* new InvalidError({ reason: "Failed to create Proposal" });
    }

    const proposalId = proposed.proposalId;
    yield* notifyProposalCreatedEffect(scopedCaseId, proposalId);

    const proposal = yield* getProposalForCaseEffect(scopedCaseId, proposalId);
    if (!proposal) {
      return yield* new NotFoundError({
        resource: "Proposal created but not readable",
      });
    }
    return { proposal };
  });
}

export function writeGraphFromAgentEffect(input: {
  caseId: string;
  organizationId: string;
  actorId: string;
  actorLabel?: string | null;
  patch: unknown;
  summary?: string;
  evidenceIds?: string[];
  userOverride: true;
  idempotencyKey?: string;
}): Effect.Effect<AgentGraphWriteResult, DomainTag> {
  return Effect.gen(function* writeGraphFromAgentGen() {
    if (!input.userOverride) {
      return yield* new InvalidError({
        reason: "userOverride must be true for graph write",
      });
    }

    const actorId = yield* requireActorIdEffect(input.actorId);
    const users = yield* loadActorUsersEffect([actorId]);
    const actorLabel = labelForActor(actorId, users, input.actorLabel);

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
      const existingId = yield* tryDb(() =>
        findGraphWriteByIdempotency({
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
              actorLabel: input.actorLabel ?? null,
              channel: "agent_write",
              userOverridden: true,
              confidence: "unverified",
              summary: plan.summary,
              patch: plan.patch,
              idempotencyKey,
            })
          );

          if (!write) {
            return yield* new InvalidError({
              reason: "Failed to record graph write",
            });
          }

          yield* applyPatchEffect({
            caseId: scopedCaseId,
            patch: plan.patch,
            confidence: "unverified",
            sharedEvidenceIds,
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
      Effect.catchTag("ConflictError", () =>
        Effect.gen(function* replayGraphWriteGen() {
          if (idempotencyKey === null) {
            return yield* new InvalidError({
              reason: "Failed to record graph write",
            });
          }
          const existingId = yield* tryDb(() =>
            findGraphWriteByIdempotency({
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
          return yield* new InvalidError({
            reason: "Failed to record graph write",
          });
        })
      )
    );

    if (!result.replayed) {
      yield* notifyEntityChangedEffect(scopedCaseId);
      if (plan.summary !== null && plan.summary !== "") {
        yield* notifyEvidenceChangedEffect(scopedCaseId);
      }
    }

    return result;
  });
}
