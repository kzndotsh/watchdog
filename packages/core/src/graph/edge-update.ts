import { Effect } from "effect";

import {
  edgesRepo,
  entitiesRepo,
  type DbExec,
  type EdgeListRow,
} from "@watchdog/db";
import {
  edgePredicateAllowsKinds,
  type ConfidenceTier,
  type EdgePredicate,
} from "@watchdog/schemas";

import { tryDb } from "../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import type { UpdateEdgeInput } from "./edges";
import {
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
} from "./patch/guards";

export interface ValidatedEdgeUpdate {
  existing: NonNullable<Awaited<ReturnType<typeof edgesRepo.getInCase>>>;
  evidenceIds: string[];
  next: {
    fromId: string;
    toId: string;
    predicate: EdgePredicate;
    confidence: ConfidenceTier;
    notes: string | null;
  };
  endpointsChanged: boolean;
  predicateChanged: boolean;
}

export function validateEdgeUpdateEffect(
  input: UpdateEdgeInput,
  existing: NonNullable<Awaited<ReturnType<typeof edgesRepo.getInCase>>>,
  evidenceIds: string[]
): Effect.Effect<ValidatedEdgeUpdate, DomainTag> {
  return Effect.gen(function* validateEdgeUpdateGen() {
    const viewEntityId = input.viewEntityId ?? existing.fromId;
    if (
      viewEntityId !== existing.fromId &&
      viewEntityId !== existing.toId
    ) {
      return yield* new InvalidError({
        reason: "viewEntityId must be an endpoint of the Edge",
      });
    }

    const hasEndpoints =
      input.fromId !== undefined || input.toId !== undefined;
    if (
      hasEndpoints &&
      (input.fromId === undefined || input.toId === undefined)
    ) {
      return yield* new InvalidError({
        reason: "fromId and toId must be sent together",
      });
    }

    if (
      !hasEndpoints &&
      input.predicate === undefined &&
      input.confidence === undefined &&
      input.notes === undefined &&
      input.evidenceIds === undefined
    ) {
      return yield* new InvalidError({ reason: "Nothing to update" });
    }

    const next = {
      fromId: input.fromId ?? existing.fromId,
      toId: input.toId ?? existing.toId,
      predicate: input.predicate ?? existing.predicate,
      confidence: input.confidence ?? existing.confidence,
      notes:
        input.notes === undefined
          ? (existing.notes ?? null)
          : input.notes.trim() || null,
    };

    yield* assertConfidenceEvidenceEffect(next.confidence, evidenceIds);

    if (next.fromId === next.toId) {
      return yield* new InvalidError({
        reason: "Edge cannot link an Entity to itself",
      });
    }
    if (viewEntityId !== next.fromId && viewEntityId !== next.toId) {
      return yield* new InvalidError({
        reason: "viewEntityId must remain an endpoint of this Edge",
      });
    }
    if (
      next.predicate === "related_to" &&
      (next.notes === null || next.notes === "")
    ) {
      return yield* new InvalidError({ reason: "related_to requires notes" });
    }

    return {
      existing,
      evidenceIds,
      next,
      endpointsChanged:
        next.fromId !== existing.fromId || next.toId !== existing.toId,
      predicateChanged: next.predicate !== existing.predicate,
    };
  });
}

export function assertEdgeKindsAllowedEffect(
  caseId: string,
  fromId: string,
  toId: string,
  predicate: EdgePredicate,
  exec: DbExec
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* assertEdgeKindsAllowedGen() {
    const from = yield* tryDb(() =>
      entitiesRepo.getInCase(exec, caseId, fromId)
    );
    const to = yield* tryDb(() => entitiesRepo.getInCase(exec, caseId, toId));
    if (!from || !to) {
      return yield* new NotFoundError({
        resource: "Entity not found in this Case",
      });
    }
    if (!edgePredicateAllowsKinds(predicate, from.kind, to.kind)) {
      return yield* new InvalidError({
        reason: `${predicate} is not allowed for ${from.kind} → ${to.kind}`,
      });
    }
  });
}

function buildEdgePatch(
  existing: NonNullable<Awaited<ReturnType<typeof edgesRepo.getInCase>>>,
  next: ValidatedEdgeUpdate["next"]
): Parameters<typeof edgesRepo.update>[2] {
  const patch: Parameters<typeof edgesRepo.update>[2] = {};
  if (next.fromId !== existing.fromId) patch.fromId = next.fromId;
  if (next.toId !== existing.toId) patch.toId = next.toId;
  if (next.predicate !== existing.predicate) {
    patch.predicate = next.predicate;
  }
  if (next.confidence !== existing.confidence) {
    patch.confidence = next.confidence;
  }
  if (next.notes !== (existing.notes ?? null)) {
    patch.notes = next.notes;
  }
  return patch;
}

export function applyValidatedEdgeUpdateEffect(
  tx: DbExec,
  input: UpdateEdgeInput,
  validated: ValidatedEdgeUpdate
): Effect.Effect<EdgeListRow, DomainTag> {
  return Effect.gen(function* applyValidatedEdgeUpdateGen() {
    const { existing, next, endpointsChanged, predicateChanged } = validated;

    if (endpointsChanged) {
      yield* assertEntityInCaseEffect(input.caseId, next.fromId, tx);
      yield* assertEntityInCaseEffect(input.caseId, next.toId, tx);
    }
    if (endpointsChanged || predicateChanged) {
      yield* assertEdgeKindsAllowedEffect(
        input.caseId,
        next.fromId,
        next.toId,
        next.predicate,
        tx
      );
    }

    const patch = buildEdgePatch(existing, next);
    if (Object.keys(patch).length > 0) {
      const updated = yield* tryDb(() =>
        edgesRepo.update(tx, input.edgeId, patch)
      );
      if (!updated) {
        return yield* new InvalidError({ reason: "Failed to update Edge" });
      }
    }

    const listedRow = yield* tryDb(() =>
      edgesRepo.getListedInCase(tx, input.caseId, input.edgeId)
    );
    if (!listedRow) {
      return yield* new InvalidError({
        reason: "Edge updated but not found",
      });
    }
    return listedRow;
  });
}
