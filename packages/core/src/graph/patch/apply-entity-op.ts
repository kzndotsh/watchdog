import { Effect } from "effect";

import { entitiesRepo } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas/graph";

import type { Db } from "../../infra/db-service";
import { tryDb } from "../../infra/postgres-effect";
import {
  ConflictError,
  InvalidError,
  type DomainTag,
} from "../../infra/tagged-errors";
import { assertEntityKindChangeAllowedEffect } from "../edge-update";
import type { GraphWriter } from "../mutation/run-graph-mutation";
import { entitiesTable } from "../mutation/tables";
import { seedDefaultQuestionsEffect } from "../questions";
import { decodeOpData, entityUpdateOpData, entityWriteOpData } from "./op-data";

const SLUG_TAKEN =
  "Entity slug already belongs to a different Entity in this Case";
const ID_IN_USE = "Entity id is already in use";

function applyEntityWriteEffect(
  w: GraphWriter,
  op: PatchOp
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyEntityWriteGen() {
    const data = yield* decodeOpData(entityWriteOpData, op.data);
    const slugOwner = yield* tryDb(() =>
      entitiesRepo.getByCaseSlug(w.tx, w.caseId, data.slug)
    );
    if (slugOwner && slugOwner.id !== op.id) {
      return yield* new ConflictError({ reason: SLUG_TAKEN });
    }
    if (op.op === "upsert" && slugOwner) {
      if (slugOwner.kind !== data.kind) {
        yield* assertEntityKindChangeAllowedEffect(
          w.caseId,
          slugOwner.id,
          data.kind,
          w.tx
        );
      }
      yield* w.update(
        entitiesTable,
        slugOwner.id,
        {
          kind: data.kind,
          name: data.name,
          summary: data.summary,
          notes: data.notes,
        },
        { expectedVersion: op.expectedVersion }
      );
      return;
    }
    // An id that already exists (here or in another Case) must not reach the primary key.
    const idOwner = yield* tryDb(() => entitiesRepo.getById(w.tx, op.id));
    if (idOwner) {
      return yield* new ConflictError({ reason: ID_IN_USE });
    }
    // The check above can lose a race with a concurrent patch using the same id; the primary
    // key is the backstop and reports the same conflict.
    const created = yield* w.insert(
      entitiesTable,
      { id: op.id, ...data },
      {
        idInUse: { uniqueIndex: "entities_pkey", conflictReason: ID_IN_USE },
      }
    );
    // Seeding appends no entries of its own: a registered helper, not a module write.
    yield* seedDefaultQuestionsEffect(w.tx, {
      id: created.id,
      caseId: created.caseId,
      kind: created.kind,
    });
  });
}

export function applyEntityOpEffect(
  w: GraphWriter,
  op: PatchOp
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyEntityOpGen() {
    if (op.op === "create" || op.op === "upsert") {
      return yield* applyEntityWriteEffect(w, op);
    }
    if (op.op === "update") {
      const patch = yield* decodeOpData(entityUpdateOpData, op.data);
      yield* w.update(entitiesTable, op.id, patch, {
        expectedVersion: op.expectedVersion,
      });
      return;
    }
    return yield* new InvalidError({
      reason: `entity does not support op: ${String(op.op)}`,
    });
  });
}
