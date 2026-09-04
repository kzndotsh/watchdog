import { Effect } from "effect";

import { claimsRepo, evidenceLinksRepo, type DbTx } from "@watchdog/db";
import {
  CLAIM_CLASSES,
  type ClaimClass,
  type ConfidenceTier,
  type PatchOp,
} from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import {
  requireDomainEnumEffect,
  requireDomainStringEffect,
} from "./apply-patch-helpers";
import { assertEntityInCaseEffect } from "./guards";

export function applyClaimOpEffect(
  tx: DbTx,
  caseId: string,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyClaimOpGen() {
    if (op.op !== "create") {
      return yield* new InvalidError({
        reason: "claim only supports create",
      });
    }
    const entityId = yield* requireDomainStringEffect(op.data, "entityId");
    yield* assertEntityInCaseEffect(caseId, entityId, tx);
    const text = yield* requireDomainStringEffect(op.data, "text");
    const claimClass =
      typeof op.data.class === "string"
        ? yield* requireDomainEnumEffect(
            op.data.class,
            CLAIM_CLASSES,
            "claim class"
          )
        : ("observation" satisfies ClaimClass);
    if (!confidence) {
      return yield* new InvalidError({
        reason: "confidence required for claim",
      });
    }
    yield* tryDb(() =>
      claimsRepo.create(tx, {
        id: op.id,
        entityId,
        text,
        class: claimClass,
        confidence,
      })
    );
    yield* tryDb(() => evidenceLinksRepo.linkClaim(tx, op.id, evidenceIds));
  });
}
