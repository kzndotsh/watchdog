import { Effect } from "effect";

import { questionsRepo, type DbTx } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas/graph";
import type { CaseId } from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { tryDb } from "../../infra/postgres-effect";
import {
  InternalError,
  InvalidError,
  type DomainTag,
} from "../../infra/tagged-errors";
import {
  appendPatchActivityEffect,
  type PatchActor,
  requireDomainStringEffect,
  requireDomainUuidEffect,
} from "./apply-patch-helpers";
import { assertEntityInCaseEffect } from "./guards";

export function applyQuestionOpEffect(
  tx: DbTx,
  caseId: CaseId,
  op: PatchOp,
  actor: PatchActor
): Effect.Effect<void, DomainTag, Db> {
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
      return yield* new InternalError({ reason: "Failed to create Question" });
    }
    yield* appendPatchActivityEffect(tx, caseId, actor, {
      kind: "question",
      action: "created",
      subjectId: created.id,
      label: created.text,
    });
  });
}
