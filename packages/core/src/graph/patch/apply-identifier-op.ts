import { Effect } from "effect";

import {
  evidenceLinksRepo,
  identifiersRepo,
  type DbTx,
} from "@watchdog/db";
import {
  IDENTIFIER_STATUSES,
  validateIdentifierWrite,
  type ConfidenceTier,
  type IdentifierStatus,
  type PatchOp,
  trimmedOrNull,
} from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import {
  requireDomainEnumEffect,
  requireDomainStringEffect,
  requireDomainUuidEffect,
} from "./apply-patch-helpers";
import { assertEntityInCaseEffect, assertEvidenceLinkedEffect } from "./guards";

export function applyIdentifierOpEffect(
  tx: DbTx,
  caseId: string,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* applyIdentifierOpGen() {
    if (op.op !== "create" && op.op !== "upsert") {
      return yield* new InvalidError({
        reason: "identifier supports create/upsert",
      });
    }
    const entityId = yield* requireDomainUuidEffect(op.data, "entityId");
    yield* assertEntityInCaseEffect(caseId, entityId, tx);
    const written = validateIdentifierWrite({
      type: yield* requireDomainStringEffect(op.data, "type"),
      value: yield* requireDomainStringEffect(op.data, "value"),
      platform: typeof op.data.platform === "string" ? op.data.platform : "",
    });
    if (!written.ok) {
      return yield* new InvalidError({ reason: written.message });
    }
    const { type, value, platform } = written;
    const status =
      typeof op.data.status === "string"
        ? yield* requireDomainEnumEffect(
            yield* requireDomainStringEffect(op.data, "status"),
            IDENTIFIER_STATUSES,
            "identifier status"
          )
        : ("unknown" satisfies IdentifierStatus);
    const notes =
      typeof op.data.notes === "string" ? trimmedOrNull(op.data.notes) : null;
    if (!confidence) {
      return yield* new InvalidError({
        reason: "confidence required for identifier",
      });
    }

    if (op.op === "upsert") {
      const existing = yield* tryDb(() =>
        identifiersRepo.findByNaturalKey(tx, {
          entityId,
          type,
          platform,
          value,
        })
      );
      if (existing) {
        const updated = yield* tryDb(() =>
          identifiersRepo.updateInCase(tx, caseId, existing.id, {
            confidence,
            status,
            notes,
          })
        );
        if (!updated) {
          return yield* new InvalidError({
            reason: "Failed to update Identifier",
          });
        }
        const linked = yield* tryDb(() =>
          evidenceLinksRepo.linkIdentifier(tx, existing.id, evidenceIds)
        );
        yield* assertEvidenceLinkedEffect(linked);
        return;
      }
    }
    const created = yield* tryDb(() =>
      identifiersRepo.create(tx, {
        id: op.id,
        entityId,
        type,
        platform,
        value,
        confidence,
        status,
        notes,
      })
    );
    if (!created) {
      return yield* new InvalidError({ reason: "Failed to create Identifier" });
    }
    const linked = yield* tryDb(() =>
      evidenceLinksRepo.linkIdentifier(tx, created.id, evidenceIds)
    );
    yield* assertEvidenceLinkedEffect(linked);
  });
}
