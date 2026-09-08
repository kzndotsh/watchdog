import { Effect } from "effect";

import { entitiesRepo, type DbTx } from "@watchdog/db";
import {
  ENTITY_KINDS,
  trimmedOrNull,
  trimmedOrUndefined,
  type PatchOp,
} from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, NotFoundError, ConflictError, type DomainTag } from "../../infra/tagged-errors";
import { assertEntityKindChangeAllowedEffect } from "../edge-update";
import { seedDefaultQuestionsEffect } from "../questions";
import {
  requireDomainEntitySlugEffect,
  requireDomainEnumEffect,
  requireDomainStringEffect,
} from "./apply-patch-helpers";
import { assertEntityInCaseEffect } from "./guards";

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
      const slug = yield* requireDomainEntitySlugEffect(op.data);
      const summary =
        typeof op.data.summary === "string"
          ? trimmedOrNull(op.data.summary)
          : null;
      const notes =
        typeof op.data.notes === "string" ? trimmedOrNull(op.data.notes) : null;

      if (op.op === "upsert") {
        const existing = yield* tryDb(() =>
          entitiesRepo.getByCaseSlug(tx, caseId, slug)
        );
        if (existing) {
          if (existing.id !== op.id) {
            return yield* new ConflictError({
              reason:
                "Entity slug already belongs to a different Entity in this Case",
            });
          }
          if (existing.kind !== kind) {
            yield* assertEntityKindChangeAllowedEffect(
              caseId,
              existing.id,
              kind,
              tx
            );
          }
          const updated = yield* tryDb(() =>
            entitiesRepo.updateInCase(tx, caseId, existing.id, {
              kind,
              name,
              summary,
              notes,
            })
          );
          if (!updated) {
            return yield* new InvalidError({
              reason: "Failed to update Entity",
            });
          }
          return;
        }
      }
      const slugOwner = yield* tryDb(() =>
        entitiesRepo.getByCaseSlug(tx, caseId, slug)
      );
      if (slugOwner && slugOwner.id !== op.id) {
        return yield* new ConflictError({
          reason:
            "Entity slug already belongs to a different Entity in this Case",
        });
      }
      const created = yield* tryDb(() =>
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
      if (!created) {
        return yield* new InvalidError({ reason: "Failed to create Entity" });
      }
      yield* seedDefaultQuestionsEffect(tx, created);
      return;
    }
    if (op.op === "update") {
      const patch: {
        summary?: string | null;
        notes?: string | null;
        name?: string;
      } = {};
      if ("summary" in op.data) {
        const value = op.data.summary;
        patch.summary =
          typeof value === "string" ? trimmedOrNull(value) : null;
      }
      if ("notes" in op.data) {
        const value = op.data.notes;
        patch.notes = typeof value === "string" ? trimmedOrNull(value) : null;
      }
      if (typeof op.data.name === "string") {
        const name = trimmedOrUndefined(op.data.name);
        if (name !== undefined) patch.name = name;
      }
      const entityId = yield* assertEntityInCaseEffect(caseId, op.id, tx);
      const updated = yield* tryDb(() =>
        entitiesRepo.updateInCase(tx, caseId, entityId, patch)
      );
      if (!updated) {
        return yield* new NotFoundError({
          resource: "Entity not found in this Case",
        });
      }
      return;
    }
    return yield* new InvalidError({
      reason: `entity does not support op: ${JSON.stringify(op.op)}`,
    });
  });
}
