import { Effect } from "effect";

import {
  evidenceRepo,
  evidenceUploadsRepo,
  type EvidenceUploadRow,
} from "@watchdog/db";
import {
  trimmedOrNull,
  trimmedOrUndefined,
  type CaseId,
} from "@watchdog/schemas/shared";

import { actorLabelForPersist } from "../actors/actor-label-snapshot";
import { requireActorIdEffect } from "../actors/require-actor-id";
import { assertCaseInOrgEffect } from "../graph/patch/guards";
import {
  createPresignedPutEffect,
  verifyUploadedObjectEffect,
  type PresignedPut,
} from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { requireWritten, tryDb, tryDbWith } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { InvalidError, type DomainTag } from "../infra/tagged-errors";
import {
  entityIdForWrite,
  labeledEvidence,
  maybeAssertEntityEffect,
  type EvidenceRecord,
} from "./evidence";
import { createCapturedEvidenceEffect } from "./evidence-activity";
import type {
  ConfirmFileUploadInput,
  PresignUploadInput,
} from "./evidence-inputs";

/**
 * Presign a direct upload and record what was declared for the key (`evidence_uploads`), so
 * confirmation can hold the uploader to it and the orphan sweep knows what is pending. The
 * hash, type and size are claims until `confirmFileUploadEffect` verifies the stored bytes.
 */
export function presignUploadEffect(
  input: PresignUploadInput
): Effect.Effect<PresignedPut, DomainTag, Db | BlobStore> {
  return Effect.gen(function* presignUploadGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const actorId = yield* requireActorIdEffect(input.actorId);
    const put = yield* createPresignedPutEffect({
      caseId: scopedCaseId,
      sha256: input.sha256,
      mime: input.mime,
      byteLength: input.byteLength,
      name: trimmedOrUndefined(input.name),
    });
    yield* tryDbWith((exec) =>
      evidenceUploadsRepo.upsertPresigned(exec, {
        caseId: scopedCaseId,
        uri: put.uri,
        declaredSha256: put.sha256,
        declaredMime: put.mime,
        declaredByteLength: put.byteLength,
        actorId,
      })
    ).pipe(requireWritten("record the presigned upload"));
    return put;
  });
}

function declaresSame(
  row: EvidenceUploadRow,
  input: ConfirmFileUploadInput
): boolean {
  return (
    row.declaredSha256 === input.sha256 &&
    row.declaredByteLength === input.byteLength &&
    row.declaredMime === input.mime
  );
}

/**
 * The Evidence an earlier, identical confirmation created (a client retry after a lost
 * response): no write, no activity entry. `null` when this upload is not confirmed yet.
 */
function alreadyConfirmedEffect(
  scopedCaseId: CaseId,
  uri: string,
  input: ConfirmFileUploadInput
): Effect.Effect<EvidenceRecord | null, DomainTag, Db> {
  return Effect.gen(function* alreadyConfirmedGen() {
    const upload = yield* tryDbWith((exec) =>
      evidenceUploadsRepo.getByUri(exec, scopedCaseId, uri)
    );
    if (
      upload === null ||
      upload.confirmedAt === null ||
      !declaresSame(upload, input)
    ) {
      return null;
    }
    const existing = yield* tryDbWith((exec) =>
      evidenceRepo.getLatestByUriIncludingDeleted(exec, scopedCaseId, uri)
    );
    return existing === null ? null : yield* labeledEvidence(existing);
  });
}

export function confirmFileUploadEffect(
  input: ConfirmFileUploadInput,
  actorId: string,
  actorLabel?: string | null
): Effect.Effect<EvidenceRecord, DomainTag, Db | BlobStore> {
  return Effect.gen(function* confirmFileUploadGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const uri = trimmedOrUndefined(input.uri);
    if (uri === undefined) {
      return yield* new InvalidError({ reason: "uri is required" });
    }
    yield* maybeAssertEntityEffect(scopedCaseId, input.entityId);
    if (!uri.startsWith(`${scopedCaseId}/`)) {
      return yield* new InvalidError({
        reason: "uri does not belong to this Case",
      });
    }
    const presigned = yield* tryDbWith((exec) =>
      evidenceUploadsRepo.getByUri(exec, scopedCaseId, uri)
    );
    if (presigned === null || !declaresSame(presigned, input)) {
      return yield* new InvalidError({
        reason: "Upload was not presigned with these values",
      });
    }
    if (presigned.confirmedAt !== null) {
      const existing = yield* alreadyConfirmedEffect(scopedCaseId, uri, input);
      if (existing !== null) return existing;
    }
    // The recorded hash is the server's, computed from the stored bytes; the declared one only
    // has to agree with it.
    const verified = yield* verifyUploadedObjectEffect({
      uri,
      sha256: input.sha256,
      mime: input.mime,
      byteLength: input.byteLength,
    });
    const entityId = entityIdForWrite(input.entityId);
    const scopedActorId = yield* requireActorIdEffect(actorId);
    const confirmedAt = yield* nowDateEffect;
    const row = yield* transact((tx) =>
      Effect.gen(function* confirmFileUploadTx() {
        // First: conditional on the values just verified (a re-presign since then matches no row),
        // and it takes the row lock the orphan sweep also needs.
        const marked = yield* tryDb(() =>
          evidenceUploadsRepo.markConfirmed(
            tx,
            scopedCaseId,
            {
              uri,
              declaredSha256: presigned.declaredSha256,
              declaredMime: presigned.declaredMime,
              declaredByteLength: presigned.declaredByteLength,
            },
            confirmedAt
          )
        );
        if (marked === null) return null;
        const created = yield* createCapturedEvidenceEffect(tx, scopedCaseId, {
          entityId,
          kind: "file",
          label: trimmedOrNull(input.label),
          mime: input.mime,
          uri,
          sha256: verified.sha256,
          actorId: scopedActorId,
          actorLabel: actorLabelForPersist(actorLabel),
        });
        return created;
      })
    );
    if (row !== null) return yield* labeledEvidence(row);
    // No row matched: a concurrent identical confirmation may have just recorded it.
    const raced = yield* alreadyConfirmedEffect(scopedCaseId, uri, input);
    if (raced !== null) return raced;
    return yield* new InvalidError({
      reason: "Upload changed or expired: upload the file again",
    });
  });
}
