import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import {
  GetObjectCommand,
  HeadObjectCommand,
  type GetObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Effect, Stream } from "effect";

import { MAX_UPLOAD_BYTES, sha256HexSchema } from "@watchdog/schemas/shared";

import {
  InternalError,
  InvalidError,
  type DomainTag,
} from "../errors/tagged-errors";
import { BlobStore, isMissingObject } from "./blob-store";
import {
  contradictsContent,
  normalizeMime,
  sniffMime,
  SNIFF_BYTES,
} from "./content-sniff";

/** What the server itself established about a stored object: nothing here is client-supplied. */
export type VerifiedObject = {
  /** SHA-256 (hex) of the stored bytes, computed by streaming them. */
  sha256: string;
  byteLength: number;
  /** The type the leading bytes name, `null` when no known signature matched. */
  sniffedMime: string | null;
};

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
function hashObjectBodyEffect(
  body: GetObjectCommandOutput["Body"],
  declaredByteLength: number
): Effect.Effect<HashedBody, InvalidError | InternalError> {
  if (!(body instanceof Readable)) {
    return Effect.succeed({
      ok: false,
      reason: "Uploaded object could not be read",
    });
  }
  return Effect.suspend(() => {
    const hash = createHash("sha256");
    const head = new Uint8Array(SNIFF_BYTES);
    let headLength = 0;
    let byteLength = 0;
    let refusal: string | undefined;
    // Stopping early closes the stream: the rest of the object is never pulled.
    return Stream.runForEachWhile(
      Stream.fromAsyncIterable(body, storeFailure("read the uploaded object")),
      (chunk) =>
        Effect.sync(() => {
          const bytes = chunkBytes(chunk);
          if (bytes === null) {
            refusal = "Uploaded object could not be read";
            return false;
          }
          byteLength += bytes.byteLength;
          if (byteLength > declaredByteLength) {
            refusal = "Uploaded object size mismatch";
            return false;
          }
          hash.update(bytes);
          if (headLength < SNIFF_BYTES) {
            const take = Math.min(SNIFF_BYTES - headLength, bytes.byteLength);
            head.set(bytes.subarray(0, take), headLength);
            headLength += take;
          }
          return true;
        })
    ).pipe(
      Effect.map((): HashedBody =>
        refusal === undefined
          ? {
              ok: true,
              sha256: hash.digest("hex"),
              byteLength,
              head: head.subarray(0, headLength),
            }
          : { ok: false, reason: refusal }
      )
    );
  });
}

function destroyBody(body: GetObjectCommandOutput["Body"]): void {
  if (body instanceof Readable) body.destroy();
}

/**
 * GetObject for verification, handing the response to `arrived` as soon as it lands. Interrupting
 * it aborts the request; a response that lands after the interruption (the abort raced it) is
 * destroyed here, since no fiber will read it.
 */
function getObjectEffect(
  client: S3Client,
  bucket: string,
  key: string,
  arrived: (res: GetObjectCommandOutput) => void
): Effect.Effect<GetObjectCommandOutput, InvalidError | InternalError> {
  return Effect.callback((resume, signal) => {
    void client
      .send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: signal,
      })
      // oxlint-disable-next-line promise/prefer-catch -- two arms on purpose: a `.catch` would also see a throw from the success arm and resume twice
      .then(
        (res) => {
          arrived(res);
          if (signal.aborted) destroyBody(res.Body);
          else resume(Effect.succeed(res));
          return null;
        },
        (error: unknown) => {
          resume(Effect.fail(storeFailure("read the uploaded object")(error)));
          return null;
        }
      );
  });
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
    const parsedSha256 = sha256HexSchema.safeParse(input.sha256);
    if (!parsedSha256.success) {
      return yield* new InvalidError({
        reason: "sha256 must be 64 hex characters",
      });
    }
    const declaredSha256 = parsedSha256.data;
    const { client, bucket } = yield* BlobStore;
    const head = yield* Effect.tryPromise({
      try: (signal) =>
        client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.uri }), {
          abortSignal: signal,
        }),
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

    // The request stays interruptible (aborting it frees the socket); once a response exists its
    // body is destroyed however the read ends, interruption between the two included.
    // The request stays interruptible (aborting it frees the socket). A response that arrived is
    // destroyed however the verification ends: read through, failed, or interrupted at any point,
    // the moment its answer was being handed over included.
    let response: GetObjectCommandOutput | undefined;
    const read = yield* Effect.uninterruptibleMask((restore) =>
      restore(
        getObjectEffect(client, bucket, input.uri, (res) => {
          response = res;
        })
      ).pipe(
        Effect.flatMap((res) =>
          restore(hashObjectBodyEffect(res.Body, input.byteLength))
        ),
        Effect.ensuring(
          Effect.sync(() => {
            destroyBody(response?.Body);
          })
        )
      )
    );
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
