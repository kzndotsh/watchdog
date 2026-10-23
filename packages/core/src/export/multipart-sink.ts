import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { Effect, type Scope } from "effect";

import { BlobStore, type BlobStoreApi } from "../infra/blob-store";
import { InternalError } from "../infra/tagged-errors";
import type { ZipSink } from "./zip-writer";

/**
 * Size of one uploaded part. S3 needs at least 5 MiB for every part but the last, and allows
 * 10,000 parts, so 8 MiB reaches about 78 GiB. It is also the most the sink holds in memory.
 */
export const MULTIPART_PART_BYTES = 8 * 1024 * 1024;

type Upload = {
  readonly store: BlobStoreApi;
  readonly key: string;
  readonly uploadId: string;
  readonly parts: CompletedPart[];
  completed: boolean;
};

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

function sinkFor(upload: Upload): ZipSink {
  let buffered: Uint8Array[] = [];
  let bufferedBytes = 0;

  async function sendPart(body: Uint8Array): Promise<void> {
    const partNumber = upload.parts.length + 1;
    const sent = await upload.store.client.send(
      new UploadPartCommand({
        Bucket: upload.store.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: body.byteLength,
      })
    );
    // A part with no ETag cannot be completed: refuse it now, not after gigabytes more.
    if (sent.ETag === undefined || sent.ETag === "") {
      throw new Error(`UploadPart ${partNumber} returned no ETag`);
    }
    upload.parts.push({ ETag: sent.ETag, PartNumber: partNumber });
  }

  async function sendBuffered(): Promise<void> {
    const body = concat(buffered, bufferedBytes);
    buffered = [];
    bufferedBytes = 0;
    await sendPart(body);
  }

  return {
    write: async (chunk) => {
      buffered.push(chunk);
      bufferedBytes += chunk.byteLength;
      if (bufferedBytes >= MULTIPART_PART_BYTES) await sendBuffered();
    },
    end: async () => {
      if (bufferedBytes > 0 || upload.parts.length === 0) await sendBuffered();
      await upload.store.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: upload.store.bucket,
          Key: upload.key,
          UploadId: upload.uploadId,
          MultipartUpload: { Parts: upload.parts },
        })
      );
      upload.completed = true;
    },
  };
}

/**
 * A sink that uploads what is written to `key` as an S3 multipart upload, one part at a time.
 * The upload is aborted when the Scope closes without `end` having completed it (a failure,
 * a cancel), so no half-written object or hidden parts are left in the bucket.
 */
export function multipartSinkEffect(
  key: string,
  contentType: string
): Effect.Effect<ZipSink, InternalError, BlobStore | Scope.Scope> {
  return Effect.gen(function* multipartSinkGen() {
    const store = yield* BlobStore;
    const upload = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: async (): Promise<Upload> => {
          const created = await store.client.send(
            new CreateMultipartUploadCommand({
              Bucket: store.bucket,
              Key: key,
              ContentType: contentType,
            })
          );
          if (created.UploadId === undefined) {
            throw new Error("the store returned no upload id");
          }
          return {
            store,
            key,
            uploadId: created.UploadId,
            parts: [],
            completed: false,
          };
        },
        catch: (cause) =>
          new InternalError({
            reason: "Couldn't start the export upload",
            cause,
          }),
      }),
      (started) =>
        started.completed
          ? Effect.void
          : Effect.tryPromise({
              try: () =>
                store.client.send(
                  new AbortMultipartUploadCommand({
                    Bucket: store.bucket,
                    Key: key,
                    UploadId: started.uploadId,
                  })
                ),
              catch: (cause) =>
                new InternalError({
                  reason: "Couldn't abort the export upload",
                  cause,
                }),
            }).pipe(Effect.ignore)
    );
    return sinkFor(upload);
  });
}
