import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";
import { confirmedEvidenceViolation } from "@watchdog/policy";
import type { CaseId, ConfidenceTier } from "@watchdog/schemas/shared";
import {
  parseGraphUuidList,
  parseTrimmedCaseId,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { onExec } from "../infra/repo-fx";
import { evidenceRepoFx } from "../infra/repos-fx";
import {
  boundEchoedId,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";

const INVALID_GRAPH_EVIDENCE_IDS = "One or more Evidence ids are invalid";
const EVIDENCE_NOT_IN_CASE =
  "One or more Evidence ids are missing or not in this Case";

/** Reject when any non-empty evidence id is not a valid graph UUID. */
export function parseGraphEvidenceIdsEffect(
  evidenceIds: Iterable<string | null | undefined>
): Effect.Effect<string[], DomainTag> {
  const unique = parseGraphUuidList(evidenceIds);
  if (unique === null) {
    return new InvalidError({
      reason: INVALID_GRAPH_EVIDENCE_IDS,
    });
  }
  return Effect.succeed(unique);
}

/** Assert each id exists in Case Evidence (hidden rows allowed for graph citations). */
export function assertEvidenceIdsInCaseEffect(
  caseId: CaseId,
  evidenceIds: string[],
  exec?: DbExec
): Effect.Effect<void, DomainTag, Db> {
  const scopedCaseId = parseTrimmedCaseId(caseId);
  if (scopedCaseId === null) {
    return new NotFoundError({ entity: "Case", id: boundEchoedId(caseId) });
  }
  const unique = parseGraphUuidList(evidenceIds);
  if (unique === null) {
    return new InvalidError({
      reason: INVALID_GRAPH_EVIDENCE_IDS,
    });
  }
  if (unique.length === 0) return Effect.void;
  return onExec(exec, (handle) =>
    evidenceRepoFx.listIdsInCase(handle, scopedCaseId, unique)
  ).pipe(
    Effect.flatMap((rows) =>
      rows.length === unique.length
        ? Effect.void
        : new InvalidError({
            reason: EVIDENCE_NOT_IN_CASE,
          })
    )
  );
}

/** Confirmed needs Evidence: refuse a `confirmed` write that cites none. */
export function assertConfidenceEvidenceEffect(
  confidence: ConfidenceTier,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag> {
  const reason = confirmedEvidenceViolation({
    confidence,
    evidenceCount: evidenceIds.length,
  });
  if (reason !== null) return new InvalidError({ reason });
  return Effect.void;
}
