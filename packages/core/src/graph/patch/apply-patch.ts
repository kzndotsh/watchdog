import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import {
  type CustodyViolationError,
  assertPatchGates,
} from "@watchdog/domain/policy";
import type { PatchOp } from "@watchdog/domain/schemas/graph";
import type {
  CaseId,
  ConfidenceTier,
  GraphHistoryChannel,
  GraphActor,
} from "@watchdog/domain/schemas/shared";
import { parseGraphUuidList } from "@watchdog/domain/schemas/shared";

import { setHistoryContextEffect } from "../../activity/graph-activity";
import { InvalidError, type DomainTag } from "../../errors/tagged-errors";
import type { Db } from "../../infra/db-service";
import { inCaseOrganizationUnchecked } from "../../infra/organization-scope";
import { transact } from "../../infra/postgres-tx";
import {
  runGraphMutationInTx,
  type JoinedGraphWriter,
} from "../mutation/run-graph-mutation";
import { applyClaimOpEffect } from "./apply-claim-op";
import { applyEdgeOpEffect } from "./apply-edge-op";
import { applyEntityOpEffect } from "./apply-entity-op";
import { applyEventOpEffect } from "./apply-event-op";
import { applyIdentifierOpEffect } from "./apply-identifier-op";
import { applyQuestionOpEffect } from "./apply-question-op";

export type ApplyPatchTx = DbTx;

export type ApplyPatchOpts = {
  caseId: CaseId;
  patch: readonly PatchOp[];
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
  /**
   * Recorded as the actor of every entry the patch appends (Accept: the reviewer; agent
   * write: the agent). With `tx`, the caller set the same actor on the history context.
   */
  actor?: GraphActor;
  /**
   * The door the patch came through, recorded on every history row it writes.
   * With `tx`, the caller's transaction must have set it (`setHistoryContextEffect`);
   * without, the patch's own transaction does.
   */
  channel: Extract<GraphHistoryChannel, "triage_accept" | "agent_write">;
  /** When set, run inside this transaction (no nested begin). */
  tx?: DbTx;
};

function evidenceIdsForOp(
  op: PatchOp,
  sharedEvidenceIds: string[]
): Effect.Effect<string[], DomainTag> {
  const combined = [...(op.evidenceIds ?? []), ...sharedEvidenceIds];
  if (combined.length === 0) return Effect.succeed([]);
  const parsed = parseGraphUuidList(combined);
  if (parsed === null) {
    return new InvalidError({
      reason: "One or more Evidence ids are invalid",
    });
  }
  return Effect.succeed(parsed);
}

function applyOpEffect(
  w: JoinedGraphWriter,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  sharedEvidenceIds: string[]
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyOpGen() {
    const evidenceIds = yield* evidenceIdsForOp(op, sharedEvidenceIds);

    switch (op.kind) {
      case "claim.create": {
        return yield* applyClaimOpEffect(w, op, confidence, evidenceIds);
      }
      case "event.create": {
        return yield* applyEventOpEffect(w, op);
      }
      case "question.create": {
        return yield* applyQuestionOpEffect(w, op);
      }
      case "entity.create":
      case "entity.upsert":
      case "entity.update": {
        return yield* applyEntityOpEffect(w, op);
      }
      case "identifier.create":
      case "identifier.upsert": {
        return yield* applyIdentifierOpEffect(w, op, confidence, evidenceIds);
      }
      case "edge.create":
      case "edge.upsert": {
        return yield* applyEdgeOpEffect(w, op, confidence, evidenceIds);
      }
      default: {
        op satisfies never;
        return yield* new InvalidError({
          reason: "Unhandled patch op kind",
        });
      }
    }
  });
}

function collectPatchEvidenceIds(
  patch: readonly PatchOp[],
  sharedEvidenceIds: string[]
): string[] | null {
  const combined: string[] = [...sharedEvidenceIds];
  for (const op of patch) {
    if (op.evidenceIds) {
      combined.push(...op.evidenceIds);
    }
  }
  if (combined.length === 0) return [];
  const parsed = parseGraphUuidList(combined);
  if (parsed === null) return null;
  return [...new Set(parsed)];
}

function mapCustody(error: CustodyViolationError): InvalidError {
  return new InvalidError({ reason: error.reason });
}

export function applyPatchEffect(
  opts: ApplyPatchOpts
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyPatchGen() {
    yield* assertPatchGates(opts.patch, {
      confidence: opts.confidence,
      sharedEvidenceIds: opts.sharedEvidenceIds,
    }).pipe(Effect.mapError(mapCustody));

    const runApply = (tx: DbTx) =>
      Effect.gen(function* runApplyGen() {
        const evidenceIds = collectPatchEvidenceIds(
          opts.patch,
          opts.sharedEvidenceIds ?? []
        );
        if (evidenceIds === null) {
          return yield* new InvalidError({
            reason: "One or more Evidence ids are invalid",
          });
        }
        yield* runGraphMutationInTx(
          tx,
          { caseId: opts.caseId, actor: opts.actor, evidenceIds },
          (w) =>
            Effect.gen(function* applyOpsGen() {
              for (const op of opts.patch) {
                yield* applyOpEffect(
                  w,
                  op,
                  opts.confidence,
                  opts.sharedEvidenceIds ?? []
                );
              }
            })
        );
      });

    if (opts.tx) {
      yield* runApply(opts.tx);
      return;
    }

    // Its own transaction: like a caller's `tx`, the Case is already scoped by the caller, so the
    // transaction takes the Case's own organization (row-level security, #718).
    yield* inCaseOrganizationUnchecked(
      opts.caseId,
      transact((tx) =>
        Effect.gen(function* applyPatchTx() {
          yield* setHistoryContextEffect(tx, {
            ...opts.actor,
            channel: opts.channel,
            // What this transaction applied (an agent write's changeset needs its patch and tier).
            changeset: {
              caseId: opts.caseId,
              confidence: opts.confidence ?? null,
              patch: opts.patch,
            },
          });
          yield* runApply(tx);
        })
      )
    );
  });
}
