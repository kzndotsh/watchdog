import { Effect } from "effect";

import { eventsRepo, type DbTx } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas/graph";
import { trimmedOrNull, type CaseId } from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { tryDb, requireWritten } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import {
  appendPatchActivityEffect,
  type PatchActor,
  requireDomainStringEffect,
  requireDomainUuidEffect,
} from "./apply-patch-helpers";
import { assertEntityInCaseEffect } from "./guards";

export function applyEventOpEffect(
  tx: DbTx,
  caseId: CaseId,
  op: PatchOp,
  actor: PatchActor
): Effect.Effect<void, DomainTag, Db> {
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
        caseId,
        when,
        what,
        whereText,
      })
    ).pipe(requireWritten("create Event"));
    yield* appendPatchActivityEffect(tx, caseId, actor, {
      kind: "event",
      action: "created",
      subjectId: created.id,
      label: created.what,
    });
  });
}
