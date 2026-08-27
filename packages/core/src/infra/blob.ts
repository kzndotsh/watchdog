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

import { env } from "@watchdog/env/server";
import { MAX_UPLOAD_BYTES, sha256HexSchema } from "@watchdog/schemas";

import { DomainError } from "./domain-error";

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

export interface PresignedPut {
  url: string;
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
  expiresIn: number;
  headers: Record<string, string>;
}

export function uploadArtifact(input: {
  caseId: string;
  bytes: Uint8Array;
  mime: string;
  name?: string;
}): Promise<UploadedArtifact> {
  const cfg = s3Config();
  const sha256 = sha256Hex(input.bytes);
  const uri = artifactUri(input.caseId, sha256, input.name);
  const s3 = getClient();
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: uri,
    Body: input.bytes,
    ContentType: input.mime,
    ContentLength: input.bytes.byteLength,
    Metadata: { sha256 },
  });
  return s3.send(command).then(() => ({
    uri,
    sha256,
    mime: input.mime,
    byteLength: input.bytes.byteLength,
  }));
}

export function createPresignedPut(input: {
  caseId: string;
  sha256: string;
  mime: string;
  byteLength: number;
  name?: string;
}): Promise<PresignedPut> {
  const sha256 = assertSha256Hex(input.sha256);
  const mime = input.mime.trim() || "application/octet-stream";
  if (!Number.isInteger(input.byteLength) || input.byteLength < 1) {
    throw new DomainError("invalid", "byteLength must be a positive integer");
  }
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    throw new DomainError(
      "invalid",
      `File exceeds ${MAX_UPLOAD_BYTES} byte limit`
    );
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

  const s3 = getClient();
  return getSignedUrl(s3, command, {
    expiresIn: PRESIGN_EXPIRES_IN,
    signableHeaders: new Set(["content-type"]),
  }).then((url) => ({
    url,
    uri,
    sha256,
    mime,
    byteLength: input.byteLength,
    expiresIn: PRESIGN_EXPIRES_IN,
    headers,
  }));
}

export function assertUploadedObject(input: {
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
}): Promise<void> {
  const sha256 = assertSha256Hex(input.sha256);
  const cfg = s3Config();
  const s3 = getClient();
  return s3
    .send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: input.uri }))
    .then((head) => {
      const metaSha = head.Metadata?.sha256?.toLowerCase();
      if (metaSha !== sha256) {
        throw new DomainError(
          "invalid",
          "Uploaded object sha256 metadata mismatch"
        );
      }
      if (head.ContentLength !== input.byteLength) {
        throw new DomainError("invalid", "Uploaded object size mismatch");
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
        throw new DomainError(
          "invalid",
          "Uploaded object Content-Type mismatch"
        );
      }
    });
}

export async function readArtifactBytes(uri: string): Promise<Uint8Array> {
  const cfg = s3Config();
  const res = await getClient().send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: uri })
  );
  if (!res.Body) throw new Error(`Empty artifact body: ${uri}`);
  const buf = await res.Body.transformToByteArray();
  return buf;
}

export function createPresignedGet(
  uri: string,
  expiresIn = 300
): Promise<string> {
  const cfg = s3Config();
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: cfg.bucket, Key: uri }),
    { expiresIn }
  );
}

/** Best-effort: objects are keyed `{caseId}/…` (`artifactUri`). */
export async function deleteCaseArtifacts(caseId: string): Promise<void> {
  const prefix = `${caseId}/`;
  const cfg = s3Config();
  const s3 = getClient();
  let token: string | undefined;
  do {
    // oxlint-disable-next-line no-await-in-loop -- S3 list pages must be sequential
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    const keys = (listed.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => key !== undefined && key !== "");
    if (keys.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- delete each list page before the next
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: cfg.bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      );
    }
    token =
      listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
  } while (token !== undefined);
}
