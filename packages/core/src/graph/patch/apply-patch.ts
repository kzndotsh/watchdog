import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import { type CustodyViolation, assertPatchGates } from "@watchdog/policy";
import type { ConfidenceTier, PatchOp } from "@watchdog/schemas";
import { parseGraphUuidList } from "@watchdog/schemas";

import { transact } from "../../infra/postgres-tx";
import { assertEvidenceIdsInCaseEffect } from "../../evidence/evidence";
import {
  InvalidError,
  type DomainTag,
} from "../../infra/tagged-errors";
import { applyClaimOpEffect } from "./apply-claim-op";
import { applyEdgeOpEffect } from "./apply-edge-op";
import { applyEntityOpEffect } from "./apply-entity-op";
import { applyEventOpEffect } from "./apply-event-op";
import { applyIdentifierOpEffect } from "./apply-identifier-op";
import { applyQuestionOpEffect } from "./apply-question-op";

export type ApplyPatchTx = DbTx;

export interface ApplyPatchOpts {
  caseId: string;
  patch: PatchOp[];
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
  /** When set, run inside this transaction (no nested begin). */
  tx?: DbTx;
}

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
  tx: DbTx,
  caseId: string,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  sharedEvidenceIds: string[]
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyOpGen() {
    const evidenceIds = yield* evidenceIdsForOp(op, sharedEvidenceIds);

    switch (op.resource) {
      case "claim": {
        yield* applyClaimOpEffect(tx, caseId, op, confidence, evidenceIds);
        return;
      }
      case "event": {
        yield* applyEventOpEffect(tx, caseId, op);
        return;
      }
      case "question": {
        yield* applyQuestionOpEffect(tx, caseId, op);
        return;
      }
      case "entity": {
        yield* applyEntityOpEffect(tx, caseId, op);
        return;
      }
      case "identifier": {
        yield* applyIdentifierOpEffect(tx, caseId, op, confidence, evidenceIds);
        return;
      }
      case "edge": {
        yield* applyEdgeOpEffect(tx, caseId, op, confidence, evidenceIds);
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

function applyOpsEffect(
  tx: DbTx,
  opts: ApplyPatchOpts
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyOpsGen() {
    for (const op of opts.patch) {
      yield* applyOpEffect(
        tx,
        opts.caseId,
        op,
        opts.confidence,
        opts.sharedEvidenceIds ?? []
      );
    }
  });
}

function mapCustody(error: CustodyViolation): InvalidError {
  return new InvalidError({ reason: error.reason });
}

export function applyPatchEffect(
  opts: ApplyPatchOpts
): Effect.Effect<void, DomainTag> {
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
        yield* applyOpsEffect(tx, opts);
      });

    if (opts.tx) {
      yield* runApply(opts.tx);
      return;
    }

    yield* transact((tx) => runApply(tx));
  });
}
