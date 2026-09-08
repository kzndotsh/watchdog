import { Effect } from "effect";

import { questionsRepo, type DbTx } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import { requireDomainStringEffect, requireDomainUuidEffect } from "./apply-patch-helpers";
import { assertEntityInCaseEffect } from "./guards";

export function applyQuestionOpEffect(
  tx: DbTx,
  caseId: string,
  op: PatchOp
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyQuestionOpGen() {
    if (op.op !== "create") {
      return yield* new InvalidError({
        reason: "question only supports create",
      });
    }
    const entityId = yield* requireDomainUuidEffect(op.data, "entityId");
    yield* assertEntityInCaseEffect(caseId, entityId, tx);
    const text = yield* requireDomainStringEffect(op.data, "text");
    const created = yield* tryDb(() =>
      questionsRepo.create(tx, {
        id: op.id,
        entityId,
        text,
        status: "open",
      })
    );
    if (!created) {
      return yield* new InvalidError({ reason: "Failed to create Question" });
    }
  });
}
