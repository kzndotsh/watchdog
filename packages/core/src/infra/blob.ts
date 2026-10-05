import { createHash } from "node:crypto";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Effect } from "effect";

import {
  MAX_UPLOAD_BYTES,
  sha256HexSchema,
  type CaseId,
} from "@watchdog/schemas/shared";

import { BlobStore, type BlobStoreApi } from "./blob-store";
import { errorMessage } from "./error-utils";
import { InvalidError, type DomainTag } from "./tagged-errors";

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

export interface UploadedArtifact {
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
}

function mapBlobCatch(error: unknown): InvalidError {
  if (error instanceof InvalidError) return error;
  return new InvalidError({ reason: errorMessage(error) });
}

function blobTry<A>(tryFn: () => Promise<A>): Effect.Effect<A, InvalidError> {
  return Effect.tryPromise({ try: tryFn, catch: mapBlobCatch });
}

export interface PresignedPut {
  url: string;
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
  expiresIn: number;
  headers: Record<string, string>;
}

export function uploadArtifactEffect(input: {
  caseId: CaseId;
  bytes: Uint8Array;
  mime: string;
  name?: string;
}): Effect.Effect<UploadedArtifact, InvalidError, BlobStore> {
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
    yield* blobTry(() => client.send(command));
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

    const { client, bucket } = yield* BlobStore;
    const uri = artifactUri(input.caseId, sha256, input.name);
    // The sha256 travels as a signed header, not a query parameter: AWS S3 accepts either,
    // but SeaweedFS silently drops `x-amz-meta-*` query parameters.
    const headers = { "Content-Type": mime, "x-amz-meta-sha256": sha256 };
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: uri,
      ContentType: mime,
      Metadata: { sha256 },
    });
    const url = yield* blobTry(() =>
      getSignedUrl(client, command, {
        expiresIn: PRESIGN_EXPIRES_IN,
        signableHeaders: new Set(["content-type", "x-amz-meta-sha256"]),
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

export function assertUploadedObjectEffect(input: {
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
}): Effect.Effect<void, DomainTag, BlobStore> {
  return Effect.gen(function* assertUploadedObjectGen() {
    const sha256 = assertSha256Hex(input.sha256);
    const { client, bucket } = yield* BlobStore;
    const head = yield* blobTry(() =>
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.uri }))
    );
    const metaSha = head.Metadata?.sha256?.toLowerCase();
    if (metaSha !== sha256) {
      return yield* new InvalidError({
        reason: "Uploaded object sha256 metadata mismatch",
      });
    }
    if (head.ContentLength !== input.byteLength) {
      return yield* new InvalidError({
        reason: "Uploaded object size mismatch",
      });
    }
    const contentType = head.ContentType?.split(";")[0]?.trim().toLowerCase();
    const expected = input.mime.split(";")[0]?.trim().toLowerCase();
    if (
      contentType !== undefined &&
      contentType !== "" &&
      expected !== undefined &&
      expected !== "" &&
      contentType !== expected
    ) {
      return yield* new InvalidError({
        reason: "Uploaded object Content-Type mismatch",
      });
    }
  });
}

export function readArtifactBytesEffect(
  uri: string
): Effect.Effect<Uint8Array, InvalidError, BlobStore> {
  return Effect.gen(function* readArtifactBytesGen() {
    const { client, bucket } = yield* BlobStore;
    const res = yield* blobTry(() =>
      client.send(new GetObjectCommand({ Bucket: bucket, Key: uri }))
    );
    if (!res.Body) {
      return yield* new InvalidError({
        reason: `Empty artifact body: ${uri}`,
      });
    }
    const body = res.Body;
    return yield* blobTry(() => body.transformToByteArray());
  });
}

export function createPresignedGetEffect(
  uri: string,
  expiresIn = 300
): Effect.Effect<string, InvalidError, BlobStore> {
  return Effect.gen(function* createPresignedGetGen() {
    const { client, bucket } = yield* BlobStore;
    return yield* blobTry(() =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: uri }), {
        expiresIn,
      })
    );
  });
}

function listCaseArtifactPage(
  s3: BlobStoreApi["client"],
  bucket: string,
  prefix: string,
  continuationToken: string | undefined
) {
  return blobTry(() =>
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
  return blobTry(() =>
    s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    )
  );
}

/** Best-effort: objects are keyed `{caseId}/…` (`artifactUri`). */
export function deleteCaseArtifactsEffect(
  caseId: CaseId
): Effect.Effect<void, InvalidError, BlobStore> {
  return Effect.gen(function* deleteCaseArtifactsGen() {
    const prefix = `${caseId}/`;
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

export {
  BlobStore,
  blobStoreLayer,
  makeBlobStoreLayer,
  recordingBlobStore,
  type BlobStoreApi,
  type RecordedBlobCall,
} from "./blob-store";
