import { Effect } from "effect";

import {
  edgesRepo,
  entitiesRepo,
  evidenceLinksRepo,
  type DbTx,
} from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas/graph";
import {
  EDGE_PREDICATES,
  edgePredicateAllowsKinds,
  trimmedOrNull,
  type CaseId,
  type ConfidenceTier,
} from "@watchdog/schemas/shared";

import { tryDb, requireWritten } from "../../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../../infra/tagged-errors";
import {
  appendPatchActivityEffect,
  type PatchActor,
  requireDomainEnumEffect,
  requireDomainStringEffect,
  requireDomainUuidEffect,
} from "./apply-patch-helpers";

export function applyEdgeOpEffect(
  tx: DbTx,
  caseId: CaseId,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[],
  actor: PatchActor
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyEdgeOpGen() {
    if (op.op !== "create" && op.op !== "upsert") {
      return yield* new InvalidError({
        reason: "edge supports create/upsert",
      });
    }
    const fromId = yield* requireDomainUuidEffect(op.data, "fromId");
    const toId = yield* requireDomainUuidEffect(op.data, "toId");
    const predicate = yield* requireDomainEnumEffect(
      yield* requireDomainStringEffect(op.data, "predicate"),
      EDGE_PREDICATES,
      "edge predicate"
    );
    const notes =
      typeof op.data.notes === "string" ? trimmedOrNull(op.data.notes) : null;
    const fromEntity = yield* tryDb(() =>
      entitiesRepo.getInCase(tx, caseId, fromId)
    );
    const toEntity = yield* tryDb(() =>
      entitiesRepo.getInCase(tx, caseId, toId)
    );
    if (!fromEntity || !toEntity) {
      return yield* new NotFoundError({
        entity: "Entity",
        id: fromEntity ? toId : fromId,
      });
    }
    if (!edgePredicateAllowsKinds(predicate, fromEntity.kind, toEntity.kind)) {
      return yield* new InvalidError({
        reason: `${predicate} is not allowed for ${fromEntity.kind} → ${toEntity.kind}`,
      });
    }
    if (fromId === toId) {
      return yield* new InvalidError({
        reason: "Edge cannot link an Entity to itself",
      });
    }
    if (!confidence) {
      return yield* new InvalidError({
        reason: "confidence required for edge",
      });
    }
    if (predicate === "related_to" && (notes === null || notes.trim() === "")) {
      return yield* new InvalidError({ reason: "related_to requires notes" });
    }

    if (op.op === "upsert") {
      const existing = yield* tryDb(() =>
        edgesRepo.findByNaturalKey(tx, {
          fromId,
          toId,
          predicate,
        })
      );
      if (existing) {
        const updated = yield* tryDb(() =>
          edgesRepo.updateInCase(tx, caseId, existing.id, {
            confidence,
            notes,
          })
        );
        if (!updated) {
          return yield* new NotFoundError({ entity: "Edge", id: existing.id });
        }
        yield* tryDb(() =>
          evidenceLinksRepo.linkEdge(tx, caseId, existing.id, evidenceIds)
        ).pipe(requireWritten("link evidence"));
        yield* appendPatchActivityEffect(tx, caseId, actor, {
          kind: "edge",
          action: "updated",
          subjectId: existing.id,
          label: predicate,
        });
        return;
      }
    }
    const created = yield* tryDb(() =>
      edgesRepo.create(tx, {
        id: op.id,
        caseId,
        fromId,
        toId,
        predicate,
        confidence,
        notes,
      })
    ).pipe(requireWritten("create Edge"));
    yield* tryDb(() =>
      evidenceLinksRepo.linkEdge(tx, caseId, created.id, evidenceIds)
    ).pipe(requireWritten("link evidence"));
    yield* appendPatchActivityEffect(tx, caseId, actor, {
      kind: "edge",
      action: "created",
      subjectId: created.id,
      label: predicate,
    });
  });
}
