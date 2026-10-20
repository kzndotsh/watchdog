import { Effect } from "effect";

import type { PatchOp } from "@watchdog/schemas/graph";

import type { Db } from "../../infra/db-service";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import type { GraphWriter } from "../mutation/run-graph-mutation";
import { questionsTable } from "../mutation/tables";
import { assertEntityInCaseEffect } from "./guards";
import { decodeOpData, questionOpData } from "./op-data";

export function applyQuestionOpEffect(
  w: GraphWriter,
  op: PatchOp
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyQuestionOpGen() {
    if (op.op !== "create") {
      return yield* new InvalidError({
        reason: "question only supports create",
      });
    }
    const data = yield* decodeOpData(questionOpData, op.data);
    yield* assertEntityInCaseEffect(w.caseId, data.entityId, w.tx);
    yield* w.insert(questionsTable, { id: op.id, ...data, status: "open" });
  });
}
