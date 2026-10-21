import { Effect } from "effect";

import type { DbExec, EvidenceRow, NewEvidence } from "@watchdog/db";
import { evidenceDisplayLabel } from "@watchdog/schemas/evidence";
import type { CaseId, EvidenceKind } from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../activity/append";
import { requireWritten } from "../infra/postgres-effect";
import { evidenceRepoFx } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";

type EvidenceActivityAction =
  | "captured"
  | "hidden"
  | "restored"
  | "attached"
  | "processed";

type EvidenceLabelSource = {
  label: string | null;
  kind: EvidenceKind;
  sourceUrl: string | null;
};

export type EvidenceActivityInput = {
  caseId: CaseId;
  action: EvidenceActivityAction;
  evidenceId: string;
  /** The row when the caller holds it; otherwise the label is read inside `tx`. */
  row?: EvidenceLabelSource;
  actorId?: string | null;
  actorLabel?: string | null;
  /** `attached`: the Entity the Evidence now belongs to (null when detached). */
  toValue?: string | null;
};

/**
 * Append one Evidence entry (ADR-0005) in the caller's transaction. The label
 * is the display label at write time (the feed shows a snapshot, and a hidden
 * row must still read). Never carries the body, text or uri.
 */
export function appendEvidenceActivityEffect(
  tx: DbExec,
  input: EvidenceActivityInput
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* appendEvidenceActivityGen() {
    let source = input.row;
    if (source === undefined) {
      const [found] = yield* evidenceRepoFx.listActivityLabelsInCase(
        tx,
        input.caseId,
        [input.evidenceId]
      );
      source = found;
    }
    yield* appendActivityEffect(tx, {
      caseId: input.caseId,
      kind: "evidence",
      action: input.action,
      subjectId: input.evidenceId,
      label: source === undefined ? null : evidenceDisplayLabel(source),
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? null,
      toValue: input.toValue ?? null,
    });
  });
}

/**
 * Insert Evidence and append its `captured` entry in `tx` (dump, upload,
 * attestation, Job landing). The caller owns the transaction.
 */
export function createCapturedEvidenceEffect(
  tx: DbExec,
  caseId: CaseId,
  values: Omit<NewEvidence, "caseId">
): Effect.Effect<EvidenceRow, DomainTag> {
  return Effect.gen(function* createCapturedEvidenceGen() {
    const row = yield* evidenceRepoFx
      .create(tx, { ...values, caseId })
      .pipe(requireWritten("create Evidence"));
    yield* appendEvidenceActivityEffect(tx, {
      caseId,
      action: "captured",
      evidenceId: row.id,
      row,
      actorId: values.actorId,
      actorLabel: values.actorLabel,
    });
    return row;
  });
}
