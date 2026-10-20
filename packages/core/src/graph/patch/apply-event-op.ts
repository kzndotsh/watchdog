import { Effect } from "effect";

import type { PatchOp } from "@watchdog/schemas/graph";

import type { Db } from "../../infra/db-service";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import type { JoinedGraphWriter } from "../mutation/run-graph-mutation";
import { eventsTable } from "../mutation/tables";
import { assertEntityInCaseEffect } from "./guards";
import { decodeOpData, eventOpData } from "./op-data";

export function applyEventOpEffect(
  w: JoinedGraphWriter,
  op: PatchOp
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyEventOpGen() {
    if (op.op !== "create") {
      return yield* new InvalidError({
        reason: "event only supports create",
      });
    }
    const data = yield* decodeOpData(eventOpData, op.data);
    yield* assertEntityInCaseEffect(w.caseId, data.entityId, w.tx);
    yield* w.insert(eventsTable, { id: op.id, ...data });
  });
}
