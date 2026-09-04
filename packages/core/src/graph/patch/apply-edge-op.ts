import { Effect } from "effect";

import {
  edgesRepo,
  entitiesRepo,
  evidenceLinksRepo,
  type DbTx,
} from "@watchdog/db";
import {
  EDGE_PREDICATES,
  edgePredicateAllowsKinds,
  type ConfidenceTier,
  type PatchOp,
} from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../../infra/tagged-errors";
import {
  requireDomainEnumEffect,
  requireDomainStringEffect,
} from "./apply-patch-helpers";

export function applyEdgeOpEffect(
  tx: DbTx,
  caseId: string,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyEdgeOpGen() {
    if (op.op !== "create" && op.op !== "upsert") {
      return yield* new InvalidError({
        reason: "edge supports create/upsert",
      });
    }
    const fromId = yield* requireDomainStringEffect(op.data, "fromId");
    const toId = yield* requireDomainStringEffect(op.data, "toId");
    const predicate = yield* requireDomainEnumEffect(
      yield* requireDomainStringEffect(op.data, "predicate"),
      EDGE_PREDICATES,
      "edge predicate"
    );
    const notes = typeof op.data.notes === "string" ? op.data.notes : null;
    const fromEntity = yield* tryDb(() =>
      entitiesRepo.getInCase(tx, caseId, fromId)
    );
    const toEntity = yield* tryDb(() =>
      entitiesRepo.getInCase(tx, caseId, toId)
    );
    if (!fromEntity || !toEntity) {
      return yield* new NotFoundError({
        resource: "Entity not found in this Case",
      });
    }
    if (!edgePredicateAllowsKinds(predicate, fromEntity.kind, toEntity.kind)) {
      return yield* new InvalidError({
        reason: `${predicate} is not allowed for ${fromEntity.kind} → ${toEntity.kind}`,
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
        yield* tryDb(() =>
          edgesRepo.update(tx, existing.id, {
            confidence,
            notes,
          })
        );
        yield* tryDb(() =>
          evidenceLinksRepo.linkEdge(tx, existing.id, evidenceIds)
        );
        return;
      }
    }
    yield* tryDb(() =>
      edgesRepo.create(tx, {
        id: op.id,
        fromId,
        toId,
        predicate,
        confidence,
        notes,
      })
    );
    yield* tryDb(() => evidenceLinksRepo.linkEdge(tx, op.id, evidenceIds));
  });
}
