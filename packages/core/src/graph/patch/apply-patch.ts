import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import { type CustodyViolationError, assertPatchGates } from "@watchdog/policy";
import type { PatchOp } from "@watchdog/schemas/graph";
import type { CaseId, ConfidenceTier } from "@watchdog/schemas/shared";
import { parseGraphUuidList } from "@watchdog/schemas/shared";

import { assertEvidenceIdsInCaseEffect } from "../../evidence/evidence";
import type { Db } from "../../infra/db-service";
import { transact } from "../../infra/postgres-tx";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import { applyClaimOpEffect } from "./apply-claim-op";
import { applyEdgeOpEffect } from "./apply-edge-op";
import { applyEntityOpEffect } from "./apply-entity-op";
import { applyEventOpEffect } from "./apply-event-op";
import { applyIdentifierOpEffect } from "./apply-identifier-op";
import type { PatchActor } from "./apply-patch-helpers";
import { applyQuestionOpEffect } from "./apply-question-op";

export type ApplyPatchTx = DbTx;

export interface ApplyPatchOpts {
  caseId: CaseId;
  patch: PatchOp[];
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
  /** Recorded as the actor of every entry the patch appends (Accept: the reviewer; agent write: the agent). */
  actorId?: string | null;
  actorLabel?: string | null;
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
  caseId: CaseId,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  sharedEvidenceIds: string[],
  actor: PatchActor
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyOpGen() {
    const evidenceIds = yield* evidenceIdsForOp(op, sharedEvidenceIds);

    switch (op.resource) {
      case "claim": {
        yield* applyClaimOpEffect(
          tx,
          caseId,
          op,
          confidence,
          evidenceIds,
          actor
        );
        return;
      }
      case "event": {
        yield* applyEventOpEffect(tx, caseId, op, actor);
        return;
      }
      case "question": {
        yield* applyQuestionOpEffect(tx, caseId, op, actor);
        return;
      }
      case "entity": {
        yield* applyEntityOpEffect(tx, caseId, op, actor);
        return;
      }
      case "identifier": {
        yield* applyIdentifierOpEffect(
          tx,
          caseId,
          op,
          confidence,
          evidenceIds,
          actor
        );
        return;
      }
      case "edge": {
        yield* applyEdgeOpEffect(
          tx,
          caseId,
          op,
          confidence,
          evidenceIds,
          actor
        );
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
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyOpsGen() {
    for (const op of opts.patch) {
      yield* applyOpEffect(
        tx,
        opts.caseId,
        op,
        opts.confidence,
        opts.sharedEvidenceIds ?? [],
        { actorId: opts.actorId, actorLabel: opts.actorLabel }
      );
    }
  });
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
        yield* applyOpsEffect(tx, opts);
      });

    if (opts.tx) {
      yield* runApply(opts.tx);
      return;
    }

    yield* transact((tx) => runApply(tx));
  });
}
