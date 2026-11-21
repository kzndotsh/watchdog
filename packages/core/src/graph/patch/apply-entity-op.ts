import { Effect } from "effect";

import type { PatchOpOf } from "@watchdog/domain/schemas/graph";

import { ConflictError, type DomainTag } from "../../errors/tagged-errors";
import type { Db } from "../../infra/db-service";
import { entitiesRepoFx } from "../../infra/repos-fx";
import { assertEntityKindChangeAllowedEffect } from "../edge-update";
import type { JoinedGraphWriter } from "../mutation/run-graph-mutation";
import { entitiesTable } from "../mutation/tables";
import { seedDefaultQuestionsEffect } from "../questions";

const SLUG_TAKEN =
  "Entity slug already belongs to a different Entity in this Case";
const ID_IN_USE = "Entity id is already in use";

type EntityWriteOp = Extract<
  PatchOpOf<"entity">,
  { kind: "entity.create" | "entity.upsert" }
>;

function applyEntityWriteEffect(
  w: JoinedGraphWriter,
  op: EntityWriteOp
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyEntityWriteGen() {
    const data = {
      kind: op.data.kind,
      name: op.data.name,
      slug: op.data.slug,
      summary: op.data.summary ?? null,
      notes: op.data.notes ?? null,
    };
    const slugOwner = yield* entitiesRepoFx.getByCaseSlug(
      w.tx,
      w.caseId,
      data.slug
    );
    if (slugOwner && slugOwner.id !== op.id) {
      return yield* new ConflictError({ reason: SLUG_TAKEN });
    }
    if (op.kind === "entity.upsert" && slugOwner) {
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
    const idOwner = yield* entitiesRepoFx.getById(w.tx, op.id);
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
  w: JoinedGraphWriter,
  op: PatchOpOf<"entity">
): Effect.Effect<void, DomainTag, Db> {
  if (op.kind !== "entity.update") return applyEntityWriteEffect(w, op);
  // Only the fields the op carries: an absent key leaves the column as it is.
  const { name, summary, notes } = op.data;
  return w
    .update(
      entitiesTable,
      op.id,
      {
        ...(name === undefined ? {} : { name }),
        ...(summary === undefined ? {} : { summary }),
        ...(notes === undefined ? {} : { notes }),
      },
      { expectedVersion: op.expectedVersion }
    )
    .pipe(Effect.asVoid);
}
