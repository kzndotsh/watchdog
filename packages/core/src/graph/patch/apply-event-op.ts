import { Effect } from "effect";

import { eventsRepo, type DbTx } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import { requireDomainStringEffect } from "./apply-patch-helpers";
import { assertEntityInCaseEffect } from "./guards";

export function applyEventOpEffect(
  tx: DbTx,
  caseId: string,
  op: PatchOp
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyEventOpGen() {
    if (op.op !== "create") {
      return yield* new InvalidError({
        reason: "event only supports create",
      });
    }
    const entityId = yield* requireDomainStringEffect(op.data, "entityId");
    yield* assertEntityInCaseEffect(caseId, entityId, tx);
    const when = yield* requireDomainStringEffect(op.data, "when");
    const what = yield* requireDomainStringEffect(op.data, "what");
    const whereText =
      typeof op.data.where === "string" ? op.data.where : null;
    yield* tryDb(() =>
      eventsRepo.create(tx, {
        id: op.id,
        entityId,
        when,
        what,
        whereText,
      })
    );
  });
}
