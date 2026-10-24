import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Effect } from "effect";

import type { ArtifactReadLimit } from "@watchdog/caps/sdk";
import {
  MAX_UPLOAD_BYTES,
  sha256HexSchema,
  type CaseId,
} from "@watchdog/schemas/shared";

import { BlobStore, type BlobStoreApi } from "./blob-store";
import { InternalError, InvalidError, type DomainTag } from "./tagged-errors";

const PRESIGN_EXPIRES_IN = 900;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertSha256Hex(value: string): string {
  return sha256HexSchema.parse(value);
}

export function artifactUri(
  caseId: CaseId,
  sha256: string,
  name?: string
): string {
  const safeName = name?.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return safeName !== undefined && safeName !== ""
    ? `${caseId}/${sha256}/${safeName}`
    : `${caseId}/${sha256}`;
}

export type UploadedArtifact = {
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
};

/**
 * A storage failure is the server's, not the caller's: an `InternalError` with a fixed
 * `Failed to <what>` message. The driver's error stays in `cause` (logged, never sent).
 */
function storageFailure(what: string) {
  return (cause: unknown) =>
    new InternalError({ reason: `Failed to ${what}`, cause });
}

function blobTry<A>(
  what: string,
  tryFn: () => Promise<A>
): Effect.Effect<A, InternalError> {
  return Effect.tryPromise({ try: tryFn, catch: storageFailure(what) });
}

export type PresignedPut = {
  url: string;
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
  expiresIn: number;
  headers: Record<string, string>;
};

export function uploadArtifactEffect(input: {
  caseId: CaseId;
  bytes: Uint8Array;
  mime: string;
  name?: string;
}): Effect.Effect<UploadedArtifact, InternalError, BlobStore> {
  return Effect.gen(function* uploadArtifactGen() {
    const { client, bucket } = yield* BlobStore;
    const sha256 = sha256Hex(input.bytes);
    const uri = artifactUri(input.caseId, sha256, input.name);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: uri,
      Body: input.bytes,
      ContentType: input.mime,
      ContentLength: input.bytes.byteLength,
      Metadata: { sha256 },
    });
    yield* blobTry("store the artifact", () => client.send(command));
    return {
      uri,
      sha256,
      mime: input.mime,
      byteLength: input.bytes.byteLength,
    };
  });
}

export function createPresignedPutEffect(input: {
  caseId: CaseId;
  sha256: string;
  mime: string;
  byteLength: number;
  name?: string;
}): Effect.Effect<PresignedPut, DomainTag, BlobStore> {
  return Effect.gen(function* createPresignedPutGen() {
    const sha256 = assertSha256Hex(input.sha256);
    const mime = input.mime.trim() || "application/octet-stream";
    if (!Number.isInteger(input.byteLength) || input.byteLength < 1) {
      return yield* new InvalidError({
        reason: "byteLength must be a positive integer",
      });
    }
    if (input.byteLength > MAX_UPLOAD_BYTES) {
      return yield* new InvalidError({
        reason: `File exceeds ${MAX_UPLOAD_BYTES} byte limit`,
      });
    }

    const { client, presignClient, bucket } = yield* BlobStore;
    const uri = artifactUri(input.caseId, sha256, input.name);
    // The sha256 travels as a signed header, not a query parameter: AWS S3 accepts either,
    // but SeaweedFS silently drops `x-amz-meta-*` query parameters.
    const headers = { "Content-Type": mime, "x-amz-meta-sha256": sha256 };
    // The declared length is signed too: the store refuses a PUT whose Content-Length differs
    // (the client sets that header itself), so an oversized upload is rejected before it is stored.
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: uri,
      ContentType: mime,
      ContentLength: input.byteLength,
      Metadata: { sha256 },
    });
    const url = yield* blobTry("sign the upload URL", () =>
      getSignedUrl(presignClient ?? client, command, {
        expiresIn: PRESIGN_EXPIRES_IN,
        signableHeaders: new Set([
          "content-type",
          "content-length",
          "x-amz-meta-sha256",
        ]),
        unhoistableHeaders: new Set(["x-amz-meta-sha256"]),
      })
    );
    return {
      url,
      uri,
      sha256,
      mime,
      byteLength: input.byteLength,
      expiresIn: PRESIGN_EXPIRES_IN,
      headers,
    };
  });
}

/**
 * Collect a body stream, stopping the moment it passes `maxBytes`: at most one chunk beyond the
 * limit is pulled. Leaving the loop early ends the stream (a Node stream is destroyed, a web
 * stream cancelled), and a Node stream is destroyed on every exit.
 */
async function readBounded(
  body: AsyncIterable<Uint8Array | string>,
  { maxBytes, reason }: ArtifactReadLimit
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of body) {
      const part = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += part.byteLength;
      if (total > maxBytes) throw new InvalidError({ reason });
      chunks.push(part);
    }
  } finally {
    if (body instanceof Readable) body.destroy();
  }
  const joined = Buffer.concat(chunks);
  return new Uint8Array(joined.buffer, joined.byteOffset, joined.byteLength);
}

/**
 * Read an artifact into memory. With `limit`, an object over `maxBytes` is refused without being
 * loaded: its declared `ContentLength` is checked before the body is touched, and a body of
 * unknown or understated length is read only up to the limit (`readBounded`). Without a limit
 * the whole object is read, so pass one wherever the artifact's size is not trusted.
 */
export function readArtifactBytesEffect(
  uri: string,
  limit?: ArtifactReadLimit
): Effect.Effect<Uint8Array, InvalidError | InternalError, BlobStore> {
  return Effect.gen(function* readArtifactBytesGen() {
    const { client, bucket } = yield* BlobStore;
    const res = yield* blobTry("read the artifact", () =>
      client.send(new GetObjectCommand({ Bucket: bucket, Key: uri }))
    );
    if (!res.Body) {
      return yield* new InternalError({
        reason: "Failed to read the artifact",
        cause: new Error(`Empty artifact body: ${uri}`),
      });
    }
    const body = res.Body;
    if (limit === undefined) {
      return yield* blobTry("read the artifact", () =>
        body.transformToByteArray()
      );
    }
    if (res.ContentLength !== undefined && res.ContentLength > limit.maxBytes) {
      if (body instanceof Readable) body.destroy();
      return yield* new InvalidError({ reason: limit.reason });
    }
    // Any body shape is read as a stream, so an object of unknown length is never loaded whole.
    const stream: AsyncIterable<Uint8Array | string> =
      body instanceof Readable ? body : body.transformToWebStream();
    // The limit's `InvalidError` is the caller's input and passes through; a broken stream is not.
    return yield* Effect.tryPromise({
      try: () => readBounded(stream, limit),
      catch: (cause) =>
        cause instanceof InvalidError
          ? cause
          : storageFailure("read the artifact")(cause),
    });
  });
}

export function createPresignedGetEffect(
  uri: string,
  expiresIn = 300,
  /** Makes the download save as this file name (`Content-Disposition: attachment`). */
  filename?: string
): Effect.Effect<string, InternalError, BlobStore> {
  return Effect.gen(function* createPresignedGetGen() {
    const { client, presignClient, bucket } = yield* BlobStore;
    return yield* blobTry("sign the download URL", () =>
      getSignedUrl(
        presignClient ?? client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: uri,
          ...(filename === undefined
            ? {}
            : {
                ResponseContentDisposition: `attachment; filename="${filename}"`,
              }),
        }),
        { expiresIn }
      )
    );
  });
}

function listCaseArtifactPage(
  s3: BlobStoreApi["client"],
  bucket: string,
  prefix: string,
  continuationToken: string | undefined
) {
  return blobTry("list the Case artifacts", () =>
    s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )
  );
}

function deleteCaseArtifactKeys(
  s3: BlobStoreApi["client"],
  bucket: string,
  keys: string[]
) {
  return blobTry("delete the Case artifacts", () =>
    s3
      .send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      )
      .then((out) => {
        // S3 answers 200 with a per-key `Errors` list when some deletes fail: that is a failure
        // here, because a purge must not report success with objects left behind.
        const failed = out.Errors ?? [];
        if (failed.length > 0) {
          throw new Error(
            `${failed.length} object(s) could not be deleted (first: ${failed[0]?.Key ?? "?"}: ${failed[0]?.Code ?? "unknown"})`
          );
        }
        return out;
      })
  );
}

/**
 * Delete the given object keys (at most 1000 per call, S3's batch limit). A key already gone is
 * not an error, so a repeat is safe; a partial `Errors` answer fails the call.
 */
export function deleteObjectKeysEffect(
  keys: string[]
): Effect.Effect<void, InternalError, BlobStore> {
  return Effect.gen(function* deleteObjectKeysGen() {
    if (keys.length === 0) return;
    const { client: s3, bucket } = yield* BlobStore;
    yield* deleteCaseArtifactKeys(s3, bucket, keys);
  });
}

/** Where the large Case export archives live: apart from `{caseId}/…`, so one listing finds them all. */
export const CASE_EXPORT_PREFIX = "exports/";

function deleteKeysUnderPrefixEffect(
  prefix: string
): Effect.Effect<void, InternalError, BlobStore> {
  return Effect.gen(function* deleteKeysUnderPrefixGen() {
    const { client: s3, bucket } = yield* BlobStore;
    let token: string | undefined;
    do {
      const listed = yield* listCaseArtifactPage(s3, bucket, prefix, token);
      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => key !== undefined && key !== "");
      if (keys.length > 0) {
        yield* deleteCaseArtifactKeys(s3, bucket, keys);
      }
      token =
        listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
    } while (token !== undefined);
  });
}

/**
 * Delete every object of a Case (they are keyed `{caseId}/…`, `artifactUri`, and its export
 * archives `exports/{caseId}/…`), page by page. Safe to repeat. Fails when the listing or any
 * delete fails (including a partial `Errors` answer), so the purge can record the failure and
 * retry instead of reporting a half-erased Case as done.
 */
export function deleteCaseArtifactsEffect(
  caseId: CaseId
): Effect.Effect<void, InternalError, BlobStore> {
  return deleteKeysUnderPrefixEffect(`${caseId}/`).pipe(
    Effect.andThen(
      deleteKeysUnderPrefixEffect(`${CASE_EXPORT_PREFIX}${caseId}/`)
    )
  );
}

export { verifyUploadedObjectEffect, type VerifiedObject } from "./blob-verify";
export {
  BlobStore,
  blobStoreLayer,
  makeBlobStoreLayer,
  recordingBlobStore,
  type BlobStoreApi,
  type RecordedBlobCall,
} from "./blob-store";
