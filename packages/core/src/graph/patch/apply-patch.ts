import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import { type CustodyViolation, assertPatchGates } from "@watchdog/policy";
import type { ConfidenceTier, PatchOp } from "@watchdog/schemas";

import { transact } from "../../infra/postgres-tx";
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

function applyOpEffect(
  tx: DbTx,
  caseId: string,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  sharedEvidenceIds: string[]
): Effect.Effect<void, DomainTag> {
  const evidenceIds = [
    ...new Set([...(op.evidenceIds ?? []), ...sharedEvidenceIds]),
  ];

  switch (op.resource) {
    case "claim": {
      return applyClaimOpEffect(tx, caseId, op, confidence, evidenceIds);
    }
    case "event": {
      return applyEventOpEffect(tx, caseId, op);
    }
    case "question": {
      return applyQuestionOpEffect(tx, caseId, op);
    }
    case "entity": {
      return applyEntityOpEffect(tx, caseId, op);
    }
    case "identifier": {
      return applyIdentifierOpEffect(tx, caseId, op, confidence, evidenceIds);
    }
    case "edge": {
      return applyEdgeOpEffect(tx, caseId, op, confidence, evidenceIds);
    }
    default: {
      const _exhaustive: never = op.resource;
      return new InvalidError({
        reason: `Unhandled resource: ${JSON.stringify(_exhaustive)}`,
      });
    }
  }
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

    if (opts.tx) {
      yield* applyOpsEffect(opts.tx, opts);
      return;
    }

    yield* transact((tx) => applyOpsEffect(tx, opts));
  });
}
