import { Effect } from "effect";

import { identifiersRepo } from "@watchdog/db";
import { validateIdentifierWrite, type PatchOp } from "@watchdog/schemas/graph";
import type { ConfidenceTier } from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { tryDb } from "../../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import type { JoinedGraphWriter } from "../mutation/run-graph-mutation";
import { identifiersTable } from "../mutation/tables";
import { assertEntityInCaseEffect } from "./guards";
import { decodeOpData, identifierOpData } from "./op-data";

export function applyIdentifierOpEffect(
  w: JoinedGraphWriter,
  op: PatchOp,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyIdentifierOpGen() {
    if (op.op !== "create" && op.op !== "upsert") {
      return yield* new InvalidError({
        reason: "identifier supports create/upsert",
      });
    }
    const data = yield* decodeOpData(identifierOpData, op.data);
    const { entityId, status, notes } = data;
    yield* assertEntityInCaseEffect(w.caseId, entityId, w.tx);
    const written = validateIdentifierWrite({
      type: data.type,
      value: data.value,
      platform: data.platform,
    });
    if (!written.ok) {
      return yield* new InvalidError({ reason: written.message });
    }
    const { type, value, platform } = written;
    if (!confidence) {
      return yield* new InvalidError({
        reason: "confidence required for identifier",
      });
    }

    if (op.op === "upsert") {
      const existing = yield* tryDb(() =>
        identifiersRepo.findByNaturalKey(w.tx, {
          entityId,
          type,
          platform,
          value,
        })
      );
      if (existing) {
        // The patch cites more Evidence for the row; it never drops what the row cites.
        yield* w.update(
          identifiersTable,
          existing.id,
          { confidence, status, notes },
          {
            expectedVersion: op.expectedVersion,
            evidence: { mode: "append", ids: evidenceIds },
          }
        );
        return;
      }
    }
    yield* w.insert(
      identifiersTable,
      {
        id: op.id,
        entityId,
        type,
        platform,
        value,
        confidence,
        status,
        notes,
      },
      { evidence: evidenceIds }
    );
  });
}
