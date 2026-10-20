import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import {
  GetObjectCommand,
  HeadObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { Effect, Predicate } from "effect";

import { MAX_UPLOAD_BYTES, sha256HexSchema } from "@watchdog/schemas/shared";

import { BlobStore } from "./blob-store";
import {
  contradictsContent,
  normalizeMime,
  sniffMime,
  SNIFF_BYTES,
} from "./content-sniff";
import { InternalError, InvalidError, type DomainTag } from "./tagged-errors";

/** What the server itself established about a stored object: nothing here is client-supplied. */
export type VerifiedObject = {
  /** SHA-256 (hex) of the stored bytes, computed by streaming them. */
  sha256: string;
  byteLength: number;
  /** The type the leading bytes name, `null` when no known signature matched. */
  sniffedMime: string | null;
};

function isMissingObject(error: unknown): boolean {
  if (!Predicate.isObject(error)) return false;
  if (error.name === "NotFound" || error.name === "NoSuchKey") return true;
  const meta = error.$metadata;
  return Predicate.isObject(meta) && meta.httpStatusCode === 404;
}

function storeFailure(what: string) {
  return (cause: unknown) =>
    isMissingObject(cause)
      ? new InvalidError({
          reason:
            "Uploaded object not found: upload the file before confirming",
        })
      : new InternalError({ reason: `Failed to ${what}`, cause });
}

function chunkBytes(chunk: unknown): Uint8Array | null {
  if (chunk instanceof Uint8Array) return chunk;
  if (typeof chunk === "string") return Buffer.from(chunk);
  return null;
}

type HashedBody =
  | { ok: true; sha256: string; byteLength: number; head: Uint8Array }
  | { ok: false; reason: string };

/**
 * Read the object once, hashing as it streams. The read is bounded by the declared size: a
 * stream that runs past it is cut off and refused, so nothing larger than the presigned limit
 * is ever consumed. Only the first `SNIFF_BYTES` are kept in memory.
 */
async function hashObjectBody(
  body: GetObjectCommandOutput["Body"],
  declaredByteLength: number
): Promise<HashedBody> {
  if (!(body instanceof Readable)) {
    return { ok: false, reason: "Uploaded object could not be read" };
  }
  const hash = createHash("sha256");
  const head = new Uint8Array(SNIFF_BYTES);
  let headLength = 0;
  let byteLength = 0;
  for await (const chunk of body) {
    const bytes = chunkBytes(chunk);
    if (bytes === null) {
      body.destroy();
      return { ok: false, reason: "Uploaded object could not be read" };
    }
    byteLength += bytes.byteLength;
    if (byteLength > declaredByteLength) {
      body.destroy();
      return { ok: false, reason: "Uploaded object size mismatch" };
    }
    hash.update(bytes);
    if (headLength < SNIFF_BYTES) {
      const take = Math.min(SNIFF_BYTES - headLength, bytes.byteLength);
      head.set(bytes.subarray(0, take), headLength);
      headLength += take;
    }
  }
  return {
    ok: true,
    sha256: hash.digest("hex"),
    byteLength,
    head: head.subarray(0, headLength),
  };
}

/**
 * Establish what is really stored at `uri` before it becomes Evidence (#305). The object must
 * exist and its size must equal the declared size (checked by HEAD first, so an oversized or
 * swapped object is refused before a byte is read); its bytes are then streamed once to compute
 * the SHA-256, which must equal the declared hash, and the leading bytes must not contradict the
 * declared content type. Any disagreement is an `InvalidError` and nothing is recorded; a store
 * that cannot be reached is an `InternalError`. The returned hash is the server's own and is the
 * only one that may be stored.
 */
export function verifyUploadedObjectEffect(input: {
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
}): Effect.Effect<VerifiedObject, DomainTag, BlobStore> {
  return Effect.gen(function* verifyUploadedObjectGen() {
    const declaredSha256 = sha256HexSchema.parse(input.sha256);
    const { client, bucket } = yield* BlobStore;
    const head = yield* Effect.tryPromise({
      try: () =>
        client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.uri })),
      catch: storeFailure("inspect the uploaded object"),
    });
    if (
      head.ContentLength !== input.byteLength ||
      input.byteLength > MAX_UPLOAD_BYTES
    ) {
      return yield* new InvalidError({
        reason: "Uploaded object size mismatch",
      });
    }
    const storedType = normalizeMime(head.ContentType ?? "");
    const declaredType = normalizeMime(input.mime);
    if (
      storedType !== "" &&
      declaredType !== "" &&
      storedType !== declaredType
    ) {
      return yield* new InvalidError({
        reason: "Uploaded object Content-Type mismatch",
      });
    }

    const read = yield* Effect.tryPromise({
      try: async () => {
        const res = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: input.uri })
        );
        return hashObjectBody(res.Body, input.byteLength);
      },
      catch: storeFailure("read the uploaded object"),
    });
    if (!read.ok) {
      return yield* new InvalidError({ reason: read.reason });
    }
    if (read.byteLength !== input.byteLength) {
      return yield* new InvalidError({
        reason: "Uploaded object size mismatch",
      });
    }
    if (read.sha256 !== declaredSha256) {
      return yield* new InvalidError({
        reason: "Uploaded object sha256 does not match the declared hash",
      });
    }
    if (contradictsContent(input.mime, read.head)) {
      return yield* new InvalidError({
        reason: "Uploaded object content does not match the declared type",
      });
    }
    return {
      sha256: read.sha256,
      byteLength: read.byteLength,
      sniffedMime: sniffMime(read.head),
    };
  });
}
