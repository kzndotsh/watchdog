import { createHash } from "node:crypto";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Effect } from "effect";

import { env } from "@watchdog/env/server";
import { MAX_UPLOAD_BYTES, sha256HexSchema } from "@watchdog/schemas";

import { errorMessage } from "./domain-error";
import { InvalidError, type DomainTag } from "./tagged-errors";

export { MAX_UPLOAD_BYTES } from "@watchdog/schemas";

const PRESIGN_EXPIRES_IN = 900;

function s3Config() {
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET,
  };
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const cfg = s3Config();
  client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
    // Avoid AWS SDK CRC32 query params — MinIO + browser PUT reject them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertSha256Hex(value: string): string {
  return sha256HexSchema.parse(value.trim().toLowerCase());
}

export function artifactUri(
  caseId: string,
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
  caseId: string;
  bytes: Uint8Array;
  mime: string;
  name?: string;
}): Effect.Effect<UploadedArtifact, InvalidError> {
  const cfg = s3Config();
  const sha256 = sha256Hex(input.bytes);
  const uri = artifactUri(input.caseId, sha256, input.name);
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: uri,
    Body: input.bytes,
    ContentType: input.mime,
    ContentLength: input.bytes.byteLength,
    Metadata: { sha256 },
  });
  return blobTry(() => getClient().send(command)).pipe(
    Effect.map(() => ({
      uri,
      sha256,
      mime: input.mime,
      byteLength: input.bytes.byteLength,
    }))
  );
}

export function createPresignedPutEffect(input: {
  caseId: string;
  sha256: string;
  mime: string;
  byteLength: number;
  name?: string;
}): Effect.Effect<PresignedPut, DomainTag> {
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

    const cfg = s3Config();
    const uri = artifactUri(input.caseId, sha256, input.name);
    const headers = { "Content-Type": mime };
    const command = new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: uri,
      ContentType: mime,
      Metadata: { sha256 },
    });
    const url = yield* blobTry(() =>
      getSignedUrl(getClient(), command, {
        expiresIn: PRESIGN_EXPIRES_IN,
        signableHeaders: new Set(["content-type"]),
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
}): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* assertUploadedObjectGen() {
    const sha256 = assertSha256Hex(input.sha256);
    const cfg = s3Config();
    const head = yield* blobTry(() =>
      getClient().send(
        new HeadObjectCommand({ Bucket: cfg.bucket, Key: input.uri })
      )
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
): Effect.Effect<Uint8Array, InvalidError> {
  return Effect.gen(function* readArtifactBytesGen() {
    const cfg = s3Config();
    const res = yield* blobTry(() =>
      getClient().send(new GetObjectCommand({ Bucket: cfg.bucket, Key: uri }))
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
): Effect.Effect<string, InvalidError> {
  const cfg = s3Config();
  return blobTry(() =>
    getSignedUrl(
      getClient(),
      new GetObjectCommand({ Bucket: cfg.bucket, Key: uri }),
      { expiresIn }
    )
  );
}

function listCaseArtifactPage(
  s3: S3Client,
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

function deleteCaseArtifactKeys(s3: S3Client, bucket: string, keys: string[]) {
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
  caseId: string
): Effect.Effect<void, InvalidError> {
  return Effect.gen(function* deleteCaseArtifactsGen() {
    const prefix = `${caseId}/`;
    const cfg = s3Config();
    const s3 = getClient();
    let token: string | undefined;
    do {
      const listed = yield* listCaseArtifactPage(s3, cfg.bucket, prefix, token);
      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => key !== undefined && key !== "");
      if (keys.length > 0) {
        yield* deleteCaseArtifactKeys(s3, cfg.bucket, keys);
      }
      token =
        listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
    } while (token !== undefined);
  });
}
