import { Effect } from "effect";

import type { PatchOp } from "@watchdog/schemas/graph";
import {
  edgePredicateAllowsKinds,
  type ConfidenceTier,
} from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { edgesRepoFx } from "../../infra/repos-fx";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import type { JoinedGraphWriter } from "../mutation/run-graph-mutation";
import { edgesTable, entitiesTable } from "../mutation/tables";
import { decodeOpData, edgeOpData } from "./op-data";

export function applyEdgeOpEffect(
  w: JoinedGraphWriter,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyEdgeOpGen() {
    if (op.op !== "create" && op.op !== "upsert") {
      return yield* new InvalidError({
        reason: "edge supports create/upsert",
      });
    }
    const { fromId, toId, predicate, notes } = yield* decodeOpData(
      edgeOpData,
      op.data
    );
    const fromEntity = yield* w.get(entitiesTable, fromId);
    const toEntity = yield* w.get(entitiesTable, toId);
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
      const existing = yield* edgesRepoFx.findByNaturalKey(w.tx, {
        fromId,
        toId,
        predicate,
      });
      if (existing) {
        // The patch cites more Evidence for the row; it never drops what the row cites.
        yield* w.update(
          edgesTable,
          existing.id,
          { confidence, notes },
          {
            expectedVersion: op.expectedVersion,
            evidence: { mode: "append", ids: evidenceIds },
          }
        );
        return;
      }
    }
    yield* w.insert(
      edgesTable,
      { id: op.id, fromId, toId, predicate, confidence, notes },
      { evidence: evidenceIds }
    );
  });
}
