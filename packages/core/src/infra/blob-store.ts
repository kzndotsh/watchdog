import { S3Client } from "@aws-sdk/client-s3";
import { Context, Effect, Layer, Predicate } from "effect";

import { env } from "@watchdog/env/server";

/** The object-store client and bucket every blob operation runs against. */
export interface BlobStoreApi {
  readonly client: S3Client;
  readonly bucket: string;
}

/**
 * The blob store (S3-compatible) as an Effect service (ADR-0002 phase 3):
 * every function in `blob.ts` is `R = BlobStore`. The live Layer builds the
 * `S3Client` when it is built and destroys it when its Scope closes, so there
 * is no module-level client. A process composes `blobStoreLayer` once
 * (`AppLive`, the worker); tests provide `recordingBlobStore().layer` or a
 * `makeBlobStoreLayer` over a fake.
 */
export class BlobStore extends Context.Service<BlobStore, BlobStoreApi>()(
  "@watchdog/core/infra/BlobStore"
) {}

function s3ClientOptions(endpoint: string) {
  return {
    endpoint,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
    // Avoid AWS SDK CRC32 query params: S3-compatible servers + browser PUT reject them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  } as const;
}

function liveBlobStore(): BlobStoreApi {
  return {
    client: new S3Client(s3ClientOptions(env.S3_ENDPOINT)),
    bucket: env.S3_BUCKET,
  };
}

/**
 * A scoped `BlobStore` Layer over a factory (it runs when the Layer is built,
 * one store per build); the Scope's release calls `client.destroy()`. Exported
 * so tests can pass a fake: the live Layer is `blobStoreLayer`.
 */
export function makeBlobStoreLayer(
  create: () => BlobStoreApi
): Layer.Layer<BlobStore> {
  return Layer.effect(
    BlobStore,
    Effect.acquireRelease(Effect.sync(create), (store) =>
      Effect.sync(() => {
        store.client.destroy();
      })
    ).pipe(Effect.map((store) => BlobStore.of(store)))
  );
}

/** Live Layer: an `S3Client` from `S3_*` env, destroyed when the Scope closes. */
export const blobStoreLayer: Layer.Layer<BlobStore> =
  makeBlobStoreLayer(liveBlobStore);

/** One command a recording blob store saw. */
export interface RecordedBlobCall {
  /** SDK command name, e.g. `PutObjectCommand`. */
  readonly command: string;
  /** The object key, when the command has one. */
  readonly key: string | undefined;
  readonly input: unknown;
}

export interface RecordingBlobStoreOptions {
  /** Objects `GetObject` serves and `PutObject` fills, by key. */
  readonly objects?: Map<string, Uint8Array>;
  /** Overrides the built-in answer for a command (throw to fail the send). */
  readonly respond?: (call: RecordedBlobCall) => unknown;
}

function keyOf(input: unknown): string | undefined {
  return Predicate.isObject(input) && typeof input.Key === "string"
    ? input.Key
    : undefined;
}

function bodyBytes(input: unknown): Uint8Array | undefined {
  return Predicate.isObject(input) && input.Body instanceof Uint8Array
    ? input.Body
    : undefined;
}

function answer(
  call: RecordedBlobCall,
  objects: Map<string, Uint8Array>
): unknown {
  if (call.command === "PutObjectCommand") {
    const bytes = bodyBytes(call.input);
    if (call.key !== undefined && bytes !== undefined) {
      objects.set(call.key, bytes);
    }
    return {};
  }
  if (call.command === "GetObjectCommand") {
    const bytes = call.key === undefined ? undefined : objects.get(call.key);
    if (bytes === undefined) throw new Error(`NoSuchKey: ${call.key}`);
    return { Body: { transformToByteArray: () => Promise.resolve(bytes) } };
  }
  return {};
}

/**
 * Test Layer: a real `S3Client` aimed at a dummy endpoint whose requests never
 * leave the process. A middleware records each command and answers it from an
 * in-memory object map (`GetObject` / `PutObject`), or from `respond`, so
 * command building and presign signing run unchanged (presigning needs no
 * network). `destroyed()` flips when the Scope closes.
 */
export function recordingBlobStore(options: RecordingBlobStoreOptions = {}): {
  readonly layer: Layer.Layer<BlobStore>;
  readonly calls: RecordedBlobCall[];
  readonly objects: Map<string, Uint8Array>;
  readonly bucket: string;
  readonly destroyed: () => boolean;
} {
  const calls: RecordedBlobCall[] = [];
  const objects = options.objects ?? new Map<string, Uint8Array>();
  const bucket = "test-bucket";
  let destroyed = false;
  const layer = makeBlobStoreLayer(() => {
    const client = new S3Client({
      endpoint: "http://blob.test.invalid",
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    client.middlewareStack.add(
      (_next, context) => (args) => {
        const call: RecordedBlobCall = {
          command: context.commandName ?? "unknown",
          key: keyOf(args.input),
          input: args.input,
        };
        calls.push(call);
        const answered = options.respond?.(call) ?? answer(call, objects);
        // The SDK's retry middleware stamps `$metadata`, so the fake carries one.
        const output = {
          $metadata: {},
          ...(Predicate.isObject(answered) ? answered : {}),
        };
        return Promise.resolve({ response: {}, output });
      },
      { step: "deserialize", priority: "high", name: "recordingBlobStore" }
    );
    const destroy = client.destroy.bind(client);
    client.destroy = () => {
      destroyed = true;
      destroy();
    };
    return { client, bucket };
  });
  return { layer, calls, objects, bucket, destroyed: () => destroyed };
}
