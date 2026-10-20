import { Effect } from "effect";

import { evidenceUploadsRepo } from "@watchdog/db";
import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas/shared";

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
    if (
      presigned === null ||
      presigned.declaredSha256 !== input.sha256 ||
      presigned.declaredByteLength !== input.byteLength ||
      presigned.declaredMime !== input.mime
    ) {
      return yield* new InvalidError({
        reason: "Upload was not presigned with these values",
      });
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
        // First: it takes the upload's row lock, which the orphan sweep also needs.
        const marked = yield* tryDb(() =>
          evidenceUploadsRepo.markConfirmed(tx, scopedCaseId, uri, confirmedAt)
        );
        if (marked === null) {
          return yield* new InvalidError({
            reason: "Upload expired: upload the file again",
          });
        }
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
    return yield* labeledEvidence(row);
  });
}
