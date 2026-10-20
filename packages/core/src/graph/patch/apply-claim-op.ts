import { Effect } from "effect";

import type { PatchOp } from "@watchdog/schemas/graph";
import type { ConfidenceTier } from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import type { JoinedGraphWriter } from "../mutation/run-graph-mutation";
import { claimsTable } from "../mutation/tables";
import { assertEntityInCaseEffect } from "./guards";
import { claimOpData, decodeOpData } from "./op-data";

export function applyClaimOpEffect(
  w: JoinedGraphWriter,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyClaimOpGen() {
    if (op.op !== "create") {
      return yield* new InvalidError({
        reason: "claim only supports create",
      });
    }
    const data = yield* decodeOpData(claimOpData, op.data);
    yield* assertEntityInCaseEffect(w.caseId, data.entityId, w.tx);
    if (!confidence) {
      return yield* new InvalidError({
        reason: "confidence required for claim",
      });
    }
    yield* w.insert(
      claimsTable,
      { id: op.id, ...data, confidence },
      { evidence: evidenceIds }
    );
  });
}
