import { randomBytes, randomUUID } from "node:crypto";

import {
  GetObjectCommand,
  ListMultipartUploadsCommand,
} from "@aws-sdk/client-s3";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { deleteObjectKeysEffect } from "../../infra/blob";
import { BlobStore, blobStoreLayer } from "../../infra/blob-store";
import { MULTIPART_PART_BYTES, multipartSinkEffect } from "../multipart-sink";

const MIB = 1024 * 1024;

function key(): string {
  return `exports/wd476-test/${randomUUID()}.bin`;
}

async function objectBytes(objectKey: string): Promise<Uint8Array | null> {
  return Effect.runPromise(
    Effect.gen(function* readObject() {
      const { client, bucket } = yield* BlobStore;
      return yield* Effect.tryPromise(async () => {
        const got = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: objectKey })
        );
        return (await got.Body?.transformToByteArray()) ?? null;
      }).pipe(Effect.orElseSucceed(() => null));
    }).pipe(Effect.provide(blobStoreLayer))
  );
}

describe("multipartSinkEffect (local S3)", () => {
  it("uploads what is written as parts, and the object is the whole stream", async () => {
    const objectKey = key();
    const written = randomBytes(MULTIPART_PART_BYTES * 2 + MIB);
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* upload() {
          const sink = yield* multipartSinkEffect(objectKey, "application/zip");
          for (let at = 0; at < written.byteLength; at += MIB) {
            yield* Effect.promise(() =>
              sink.write(written.subarray(at, at + MIB))
            );
          }
          yield* Effect.promise(() => sink.end());
        })
      ).pipe(Effect.provide(blobStoreLayer))
    );
    const stored = await objectBytes(objectKey);
    await Effect.runPromise(
      deleteObjectKeysEffect([objectKey]).pipe(Effect.provide(blobStoreLayer))
    );
    expect(stored === null ? null : Buffer.from(stored).equals(written)).toBe(
      true
    );
  }, 60_000);

  it("aborts the upload when the scope closes before it ended: no object, no dangling parts", async () => {
    const objectKey = key();
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* abandon() {
          const sink = yield* multipartSinkEffect(objectKey, "application/zip");
          yield* Effect.promise(() =>
            sink.write(randomBytes(MULTIPART_PART_BYTES + 1))
          );
          // The scope ends here without `sink.end()`: a failed or cancelled export.
        })
      ).pipe(Effect.provide(blobStoreLayer))
    );
    expect(await objectBytes(objectKey)).toBeNull();
    const dangling = await Effect.runPromise(
      Effect.gen(function* listUploads() {
        const { client, bucket } = yield* BlobStore;
        return yield* Effect.promise(() =>
          client.send(
            new ListMultipartUploadsCommand({
              Bucket: bucket,
              Prefix: objectKey,
            })
          )
        );
      }).pipe(Effect.provide(blobStoreLayer))
    );
    expect(dangling.Uploads ?? []).toEqual([]);
  }, 60_000);
});
