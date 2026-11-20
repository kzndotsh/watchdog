import { Effect } from "effect";

import {
  validateIdentifierWrite,
  type PatchOpOf,
} from "@watchdog/schemas/graph";
import type { ConfidenceTier } from "@watchdog/schemas/shared";

import { assertEntityInCaseEffect } from "../../cases/access";
import { InvalidError, type DomainTag } from "../../errors/tagged-errors";
import type { Db } from "../../infra/db-service";
import { identifiersRepoFx } from "../../infra/repos-fx";
import type { JoinedGraphWriter } from "../mutation/run-graph-mutation";
import { identifiersTable } from "../mutation/tables";

export function applyIdentifierOpEffect(
  w: JoinedGraphWriter,
  op: PatchOpOf<"identifier">,
  confidence: ConfidenceTier | undefined,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* applyIdentifierOpGen() {
    const { entityId } = op.data;
    const status = op.data.status ?? "unknown";
    const notes = op.data.notes ?? null;
    yield* assertEntityInCaseEffect(w.caseId, entityId, w.tx);
    // A Cap may propose an imprecise value; the reviewer sees it flagged and Accept refuses it.
    const written = validateIdentifierWrite({
      type: op.data.type,
      value: op.data.value,
      platform: op.data.platform ?? "",
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

    if (op.kind === "identifier.upsert") {
      const existing = yield* identifiersRepoFx.findByNaturalKey(w.tx, {
        entityId,
        type,
        platform,
        value,
      });
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
