import { Effect } from "effect";

import type { DbExec, EdgePatch, edgesRepo } from "@watchdog/db";
import {
  edgePredicateAllowsKinds,
  parseOptionalTrimmedUuid,
  trimmedOrNull,
  type CaseId,
  type ConfidenceTier,
  type EdgePredicate,
  type EntityKind,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { onExec } from "../infra/repo-fx";
import { entitiesRepoFx, edgesRepoFx } from "../infra/repos-fx";
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

export type ValidatedEdgeUpdate = {
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
};

export function validateEdgeUpdateEffect(
  input: UpdateEdgeInput,
  existing: NonNullable<Awaited<ReturnType<typeof edgesRepo.getInCase>>>,
  evidenceIds: string[]
): Effect.Effect<ValidatedEdgeUpdate, DomainTag> {
  return Effect.gen(function* validateEdgeUpdateGen() {
    const rawFromId = input.fromId;
    const fromId =
      rawFromId === undefined ? undefined : parseOptionalTrimmedUuid(rawFromId);
    if (rawFromId !== undefined && fromId === undefined) {
      return yield* new InvalidError({ reason: "fromId must be a valid UUID" });
    }
    const rawToId = input.toId;
    const toId =
      rawToId === undefined ? undefined : parseOptionalTrimmedUuid(rawToId);
    if (rawToId !== undefined && toId === undefined) {
      return yield* new InvalidError({ reason: "toId must be a valid UUID" });
    }

    const rawViewEntityId = input.viewEntityId;
    const viewEntityId =
      rawViewEntityId === undefined
        ? undefined
        : parseOptionalTrimmedUuid(rawViewEntityId);
    if (rawViewEntityId !== undefined && viewEntityId === undefined) {
      return yield* new InvalidError({
        reason: "viewEntityId must be a valid UUID",
      });
    }
    const resolvedViewEntityId = viewEntityId ?? existing.fromId;
    if (
      resolvedViewEntityId !== existing.fromId &&
      resolvedViewEntityId !== existing.toId
    ) {
      return yield* new InvalidError({
        reason: "viewEntityId must be an endpoint of the Edge",
      });
    }

    const hasEndpoints = fromId !== undefined || toId !== undefined;
    if (hasEndpoints && (fromId === undefined || toId === undefined)) {
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
      fromId: fromId ?? existing.fromId,
      toId: toId ?? existing.toId,
      predicate: input.predicate ?? existing.predicate,
      confidence: input.confidence ?? existing.confidence,
      notes:
        input.notes === undefined
          ? (existing.notes ?? null)
          : trimmedOrNull(input.notes),
    };

    yield* assertConfidenceEvidenceEffect(next.confidence, evidenceIds);

    if (next.fromId === next.toId) {
      return yield* new InvalidError({
        reason: "Edge cannot link an Entity to itself",
      });
    }
    if (
      resolvedViewEntityId !== next.fromId &&
      resolvedViewEntityId !== next.toId
    ) {
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
  caseId: CaseId,
  fromId: string,
  toId: string,
  predicate: EdgePredicate,
  exec: DbExec
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* assertEdgeKindsAllowedGen() {
    const from = yield* entitiesRepoFx.getInCase(exec, caseId, fromId);
    const to = yield* entitiesRepoFx.getInCase(exec, caseId, toId);
    if (!from || !to) {
      return yield* new NotFoundError({
        entity: "Entity",
        id: from ? toId : fromId,
      });
    }
    if (!edgePredicateAllowsKinds(predicate, from.kind, to.kind)) {
      return yield* new InvalidError({
        reason: `${predicate} is not allowed for ${from.kind} → ${to.kind}`,
      });
    }
  });
}

export function assertEntityKindChangeAllowedEffect(
  caseId: CaseId,
  entityId: string,
  nextKind: EntityKind,
  exec?: DbExec
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* assertEntityKindChangeAllowedGen() {
    const edges = yield* onExec(exec, (handle) =>
      edgesRepoFx.listForEntity(handle, caseId, entityId)
    );
    for (const edge of edges) {
      const fromKind = edge.fromId === entityId ? nextKind : edge.fromKind;
      const toKind = edge.toId === entityId ? nextKind : edge.toKind;
      if (!edgePredicateAllowsKinds(edge.predicate, fromKind, toKind)) {
        return yield* new InvalidError({
          reason: `Cannot change Entity kind to ${nextKind}: ${edge.predicate} is not allowed for ${fromKind} → ${toKind}`,
        });
      }
    }
  });
}

function buildEdgePatch(
  existing: NonNullable<Awaited<ReturnType<typeof edgesRepo.getInCase>>>,
  next: ValidatedEdgeUpdate["next"]
): EdgePatch {
  const patch: EdgePatch = {};
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

/**
 * The Edge columns a validated update changes, after the rules that need the database: both
 * endpoints are Entities of the Case and the kind matrix allows the predicate between them.
 * Reads only; the write is the Graph mutation module's `update`.
 */
export function edgeUpdatePatchEffect(
  tx: DbExec,
  caseId: CaseId,
  validated: ValidatedEdgeUpdate
): Effect.Effect<EdgePatch, DomainTag, Db> {
  return Effect.gen(function* edgeUpdatePatchGen() {
    const { existing, next, endpointsChanged, predicateChanged } = validated;

    if (endpointsChanged) {
      next.fromId = yield* assertEntityInCaseEffect(caseId, next.fromId, tx);
      next.toId = yield* assertEntityInCaseEffect(caseId, next.toId, tx);
    }
    if (endpointsChanged || predicateChanged) {
      yield* assertEdgeKindsAllowedEffect(
        caseId,
        next.fromId,
        next.toId,
        next.predicate,
        tx
      );
    }
    return buildEdgePatch(existing, next);
  });
}
