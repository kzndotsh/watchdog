import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { Effect, type Scope } from "effect";

import { InternalError } from "../errors/tagged-errors";
import { BlobStore, type BlobStoreApi } from "../infra/blob-store";
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

function uploadFailure(reason: string) {
  return (cause: unknown) => new InternalError({ reason, cause });
}

function sinkFor(upload: Upload): ZipSink {
  let buffered: Uint8Array[] = [];
  let bufferedBytes = 0;

  const sendPart = (body: Uint8Array): Effect.Effect<void, InternalError> =>
    Effect.gen(function* sendPartGen() {
      const partNumber = upload.parts.length + 1;
      const sent = yield* Effect.tryPromise({
        try: () =>
          upload.store.client.send(
            new UploadPartCommand({
              Bucket: upload.store.bucket,
              Key: upload.key,
              UploadId: upload.uploadId,
              PartNumber: partNumber,
              Body: body,
              ContentLength: body.byteLength,
            })
          ),
        catch: uploadFailure(`Couldn't upload export part ${partNumber}`),
      });
      // A part with no ETag cannot be completed: refuse it now, not after gigabytes more.
      if (sent.ETag === undefined || sent.ETag === "") {
        return yield* new InternalError({
          reason: `UploadPart ${partNumber} returned no ETag`,
        });
      }
      upload.parts.push({ ETag: sent.ETag, PartNumber: partNumber });
    });

  const sendBuffered = Effect.suspend(() => {
    const body = concat(buffered, bufferedBytes);
    buffered = [];
    bufferedBytes = 0;
    return sendPart(body);
  });

  return {
    write: (chunk) =>
      Effect.suspend(() => {
        buffered.push(chunk);
        bufferedBytes += chunk.byteLength;
        return bufferedBytes >= MULTIPART_PART_BYTES
          ? sendBuffered
          : Effect.void;
      }),
    end: Effect.gen(function* endGen() {
      if (bufferedBytes > 0 || upload.parts.length === 0) {
        yield* sendBuffered;
      }
      yield* Effect.tryPromise({
        try: () =>
          upload.store.client.send(
            new CompleteMultipartUploadCommand({
              Bucket: upload.store.bucket,
              Key: upload.key,
              UploadId: upload.uploadId,
              MultipartUpload: { Parts: upload.parts },
            })
          ),
        catch: uploadFailure("Couldn't complete the export upload"),
      });
      upload.completed = true;
    }),
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
        try: () =>
          store.client.send(
            new CreateMultipartUploadCommand({
              Bucket: store.bucket,
              Key: key,
              ContentType: contentType,
            })
          ),
        catch: uploadFailure("Couldn't start the export upload"),
      }).pipe(
        Effect.flatMap((created) =>
          created.UploadId === undefined
            ? Effect.fail(
                new InternalError({
                  reason: "Couldn't start the export upload",
                  cause: new Error("the store returned no upload id"),
                })
              )
            : Effect.succeed<Upload>({
                store,
                key,
                uploadId: created.UploadId,
                parts: [],
                completed: false,
              })
        )
      ),
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
