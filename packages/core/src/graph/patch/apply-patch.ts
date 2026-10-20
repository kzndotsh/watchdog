import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import { type CustodyViolationError, assertPatchGates } from "@watchdog/policy";
import type { PatchOp } from "@watchdog/schemas/graph";
import type {
  CaseId,
  ConfidenceTier,
  GraphHistoryChannel,
  GraphActor,
} from "@watchdog/schemas/shared";
import { parseGraphUuidList } from "@watchdog/schemas/shared";

import { assertEvidenceIdsInCaseEffect } from "../../evidence/evidence";
import type { Db } from "../../infra/db-service";
import { transact } from "../../infra/postgres-tx";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import { setHistoryContextEffect } from "../graph-activity";
import {
  runGraphMutationInTx,
  type GraphWriter,
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
  patch: PatchOp[];
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
  w: GraphWriter,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  sharedEvidenceIds: string[]
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyOpGen() {
    const evidenceIds = yield* evidenceIdsForOp(op, sharedEvidenceIds);

    switch (op.resource) {
      case "claim": {
        yield* applyClaimOpEffect(w, op, confidence, evidenceIds);
        return;
      }
      case "event": {
        yield* applyEventOpEffect(w, op);
        return;
      }
      case "question": {
        yield* applyQuestionOpEffect(w, op);
        return;
      }
      case "entity": {
        yield* applyEntityOpEffect(w, op);
        return;
      }
      case "identifier": {
        yield* applyIdentifierOpEffect(w, op, confidence, evidenceIds);
        return;
      }
      case "edge": {
        yield* applyEdgeOpEffect(w, op, confidence, evidenceIds);
        return;
      }
      default: {
        const _exhaustive: never = op.resource;
        return yield* new InvalidError({
          reason: `Unhandled resource: ${String(_exhaustive)}`,
        });
      }
    }
  });
}

function collectPatchEvidenceIds(
  patch: PatchOp[],
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
        if (evidenceIds.length > 0) {
          yield* assertEvidenceIdsInCaseEffect(opts.caseId, evidenceIds, tx);
        }
        yield* runGraphMutationInTx(
          tx,
          { caseId: opts.caseId, actor: opts.actor },
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

    yield* transact((tx) =>
      Effect.gen(function* applyPatchTx() {
        yield* setHistoryContextEffect(tx, {
          ...opts.actor,
          channel: opts.channel,
        });
        yield* runApply(tx);
      })
    );
  });
}
