import { Effect } from "effect";

import type { PatchOpOf } from "@watchdog/domain/schemas/graph";

import { assertEntityInCaseEffect } from "../../cases/access";
import type { DomainTag } from "../../errors/tagged-errors";
import type { Db } from "../../infra/db-service";
import type { JoinedGraphWriter } from "../mutation/run-graph-mutation";
import { questionsTable } from "../mutation/tables";

export function applyQuestionOpEffect(
  w: JoinedGraphWriter,
  op: PatchOpOf<"question">
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyQuestionOpGen() {
    const { entityId, text } = op.data;
    yield* assertEntityInCaseEffect(w.caseId, entityId, w.tx);
    yield* w.insert(questionsTable, {
      id: op.id,
      entityId,
      text,
      status: "open",
    });
  });
}
