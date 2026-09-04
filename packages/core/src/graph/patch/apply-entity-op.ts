import { Effect } from "effect";

import { entitiesRepo, type DbTx } from "@watchdog/db";
import { ENTITY_KINDS, type PatchOp } from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import {
  requireDomainEnumEffect,
  requireDomainStringEffect,
} from "./apply-patch-helpers";

export function applyEntityOpEffect(
  tx: DbTx,
  caseId: string,
  op: PatchOp
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyEntityOpGen() {
    if (op.op === "create" || op.op === "upsert") {
      const kind = yield* requireDomainEnumEffect(
        yield* requireDomainStringEffect(op.data, "kind"),
        ENTITY_KINDS,
        "entity kind"
      );
      const name = yield* requireDomainStringEffect(op.data, "name");
      const slug = yield* requireDomainStringEffect(op.data, "slug");
      const summary =
        typeof op.data.summary === "string" ? op.data.summary : null;
      const notes = typeof op.data.notes === "string" ? op.data.notes : null;

      if (op.op === "upsert") {
        const existing = yield* tryDb(() =>
          entitiesRepo.getByCaseSlug(tx, caseId, slug)
        );
        if (existing) {
          yield* tryDb(() =>
            entitiesRepo.update(tx, existing.id, {
              kind,
              name,
              summary,
              notes,
            })
          );
          return;
        }
      }
      yield* tryDb(() =>
        entitiesRepo.create(tx, {
          id: op.id,
          caseId,
          kind,
          name,
          slug,
          summary,
          notes,
        })
      );
      return;
    }
    if (op.op === "update") {
      const patch: {
        summary?: string;
        notes?: string;
        name?: string;
      } = {};
      if (typeof op.data.summary === "string") patch.summary = op.data.summary;
      if (typeof op.data.notes === "string") patch.notes = op.data.notes;
      if (typeof op.data.name === "string") patch.name = op.data.name;
      yield* tryDb(() => entitiesRepo.update(tx, op.id, patch));
      return;
    }
    return yield* new InvalidError({
      reason: `entity does not support op: ${JSON.stringify(op.op)}`,
    });
  });
}
