import { Effect } from "effect";

import {
  evidenceLinksRepo,
  identifiersRepo,
  type DbTx,
} from "@watchdog/db";
import {
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPES,
  validateIdentifierWrite,
  type ConfidenceTier,
  type IdentifierStatus,
  type PatchOp,
} from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import {
  requireDomainEnumEffect,
  requireDomainStringEffect,
} from "./apply-patch-helpers";
import { assertEntityInCaseEffect } from "./guards";

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
    const entityId = yield* requireDomainStringEffect(op.data, "entityId");
    yield* assertEntityInCaseEffect(caseId, entityId, tx);
    const type = yield* requireDomainEnumEffect(
      yield* requireDomainStringEffect(op.data, "type"),
      IDENTIFIER_TYPES,
      "identifier type"
    );
    const written = validateIdentifierWrite({
      type,
      value: yield* requireDomainStringEffect(op.data, "value"),
      platform: typeof op.data.platform === "string" ? op.data.platform : "",
    });
    if (!written.ok) {
      return yield* new InvalidError({ reason: written.message });
    }
    const { value, platform } = written;
    const status =
      typeof op.data.status === "string"
        ? yield* requireDomainEnumEffect(
            op.data.status,
            IDENTIFIER_STATUSES,
            "identifier status"
          )
        : ("unknown" satisfies IdentifierStatus);
    const notes = typeof op.data.notes === "string" ? op.data.notes : null;
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
        yield* tryDb(() =>
          identifiersRepo.update(tx, existing.id, {
            confidence,
            status,
            notes,
          })
        );
        yield* tryDb(() =>
          evidenceLinksRepo.linkIdentifier(tx, existing.id, evidenceIds)
        );
        return;
      }
    }
    yield* tryDb(() =>
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
    yield* tryDb(() =>
      evidenceLinksRepo.linkIdentifier(tx, op.id, evidenceIds)
    );
  });
}
