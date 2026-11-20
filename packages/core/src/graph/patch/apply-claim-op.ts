import { Effect } from "effect";

import type { PatchOpOf } from "@watchdog/schemas/graph";
import type { ConfidenceTier } from "@watchdog/schemas/shared";

import { assertEntityInCaseEffect } from "../../cases/access";
import { InvalidError, type DomainTag } from "../../errors/tagged-errors";
import type { Db } from "../../infra/db-service";
import type { JoinedGraphWriter } from "../mutation/run-graph-mutation";
import { claimsTable } from "../mutation/tables";

export function applyClaimOpEffect(
  w: JoinedGraphWriter,
  op: PatchOpOf<"claim">,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyClaimOpGen() {
    const { entityId, text } = op.data;
    yield* assertEntityInCaseEffect(w.caseId, entityId, w.tx);
    if (!confidence) {
      return yield* new InvalidError({
        reason: "confidence required for claim",
      });
    }
    yield* w.insert(
      claimsTable,
      {
        id: op.id,
        entityId,
        text,
        class: op.data.class ?? "observation",
        confidence,
      },
      { evidence: evidenceIds }
    );
  });
}
