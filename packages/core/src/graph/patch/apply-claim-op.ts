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
  requireDomainUuidEffect,
} from "./apply-patch-helpers";
import { assertEntityInCaseEffect, assertEvidenceLinkedEffect } from "./guards";

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
    const entityId = yield* requireDomainUuidEffect(op.data, "entityId");
    yield* assertEntityInCaseEffect(caseId, entityId, tx);
    const text = yield* requireDomainStringEffect(op.data, "text");
    const claimClass =
      typeof op.data.class === "string"
        ? yield* requireDomainEnumEffect(
            yield* requireDomainStringEffect(op.data, "class"),
            CLAIM_CLASSES,
            "claim class"
          )
        : ("observation" satisfies ClaimClass);
    if (!confidence) {
      return yield* new InvalidError({
        reason: "confidence required for claim",
      });
    }
    const created = yield* tryDb(() =>
      claimsRepo.create(tx, {
        id: op.id,
        entityId,
        text,
        class: claimClass,
        confidence,
      })
    );
    if (!created) {
      return yield* new InvalidError({ reason: "Failed to create Claim" });
    }
    const linked = yield* tryDb(() =>
      evidenceLinksRepo.linkClaim(tx, created.id, evidenceIds)
    );
    yield* assertEvidenceLinkedEffect(linked);
  });
}
