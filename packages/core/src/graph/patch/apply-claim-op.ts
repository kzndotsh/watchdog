import { Effect } from "effect";

import { claimsRepo, evidenceLinksRepo, type DbTx } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas/graph";
import {
  CLAIM_CLASSES,
  type CaseId,
  type ClaimClass,
  type ConfidenceTier,
} from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { tryDb, requireWritten } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import {
  appendPatchActivityEffect,
  type PatchActor,
  requireDomainEnumEffect,
  requireDomainStringEffect,
  requireDomainUuidEffect,
} from "./apply-patch-helpers";
import { assertEntityInCaseEffect } from "./guards";

export function applyClaimOpEffect(
  tx: DbTx,
  caseId: CaseId,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[],
  actor: PatchActor
): Effect.Effect<void, DomainTag, Db> {
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
        caseId,
        text,
        class: claimClass,
        confidence,
      })
    ).pipe(requireWritten("create Claim"));
    yield* tryDb(() =>
      evidenceLinksRepo.linkClaim(tx, caseId, created.id, evidenceIds)
    ).pipe(requireWritten("link evidence"));
    yield* appendPatchActivityEffect(tx, caseId, actor, {
      kind: "claim",
      action: "created",
      subjectId: created.id,
      label: created.text,
    });
  });
}
