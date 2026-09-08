import { Effect } from "effect";

import { eventsRepo, type DbTx } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas";
import { trimmedOrNull } from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import { requireDomainStringEffect, requireDomainUuidEffect } from "./apply-patch-helpers";
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
    const entityId = yield* requireDomainUuidEffect(op.data, "entityId");
    yield* assertEntityInCaseEffect(caseId, entityId, tx);
    const when = yield* requireDomainStringEffect(op.data, "when");
    const what = yield* requireDomainStringEffect(op.data, "what");
    const whereText =
      typeof op.data.where === "string" ? trimmedOrNull(op.data.where) : null;
    const created = yield* tryDb(() =>
      eventsRepo.create(tx, {
        id: op.id,
        entityId,
        when,
        what,
        whereText,
      })
    );
    if (!created) {
      return yield* new InvalidError({ reason: "Failed to create Event" });
    }
  });
}
