import { S3Client } from "@aws-sdk/client-s3";
import { Effect, Exit, Layer, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

import {
  createPresignedGetEffect,
  createPresignedPutEffect,
  sha256Hex,
  deleteCaseArtifactsEffect,
  readArtifactBytesEffect,
  uploadArtifactEffect,
  verifyUploadedObjectEffect,
} from "../blob";
import {
  BlobStore,
  makeBlobStoreLayer,
  recordingBlobStore,
} from "../blob-store";

const CASE_ID = testCaseId(1);

function provide<A, E>(
  effect: Effect.Effect<A, E, BlobStore>,
  store: ReturnType<typeof recordingBlobStore>
): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, store.layer));
}

const readBucket = Effect.gen(function* readBucketGen() {
  const { bucket } = yield* BlobStore;
  return bucket;
});

describe("BlobStore scope", () => {
  it("destroys the client when the Layer's scope closes", async () => {
    const store = recordingBlobStore();
    const scope = await Effect.runPromise(Scope.make());
    const bucket = await Effect.runPromise(
      Layer.buildWithScope(store.layer, scope).pipe(
        Effect.flatMap((context) => Effect.provideContext(readBucket, context))
      )
    );
    expect(bucket).toBe(store.bucket);
    expect(store.destroyed()).toBe(false);

    await Effect.runPromise(Scope.close(scope, Exit.void));
    expect(store.destroyed()).toBe(true);
  });

  it("destroys the client after a provided effect completes", async () => {
    const store = recordingBlobStore();
    await provide(readBucket, store);
    expect(store.destroyed()).toBe(true);
  });
});

describe("blob operations over an alternate Layer", () => {
  it("uploads to the service's bucket and reads the bytes back", async () => {
    const store = recordingBlobStore();
    const bytes = new TextEncoder().encode("hello blob");

    const uploaded = await provide(
      uploadArtifactEffect({
        caseId: CASE_ID,
        bytes,
        mime: "text/plain",
        name: "a.txt",
      }),
      store
    );

    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]?.command).toBe("PutObjectCommand");
    expect(store.calls[0]?.input).toMatchObject({
      Bucket: store.bucket,
      Key: uploaded.uri,
      ContentType: "text/plain",
    });

    const read = await provide(readArtifactBytesEffect(uploaded.uri), store);
    expect(new TextDecoder().decode(read)).toBe("hello blob");
  });

  it("maps a failed send to InvalidError", async () => {
    const store = recordingBlobStore();
    const exit = await Effect.runPromiseExit(
      readArtifactBytesEffect(`${CASE_ID}/missing`).pipe(
        Effect.provide(store.layer)
      )
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("InvalidError");
  });

  it("presigns URLs against the service's client without a network call", async () => {
    const store = recordingBlobStore();
    const put = await provide(
      createPresignedPutEffect({
        caseId: CASE_ID,
        sha256: "a".repeat(64),
        mime: "text/plain",
        byteLength: 3,
      }),
      store
    );
    expect(put.url).toContain("blob.test.invalid");
    expect(put.url).toContain(store.bucket);
    // The declared length is part of the signature, so the store refuses a different one.
    expect(
      new URL(put.url).searchParams.get("X-Amz-SignedHeaders")?.split(";")
    ).toContain("content-length");
    const get = await provide(createPresignedGetEffect(put.uri), store);
    expect(get).toContain(put.uri);
    expect(store.calls).toHaveLength(0);
  });

  it("signs presigned URLs for the public address and destroys both clients", async () => {
    const options = {
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      forcePathStyle: true,
    } as const;
    const internal = new S3Client({
      ...options,
      endpoint: "http://s3.internal.invalid:8333",
    });
    const publicClient = new S3Client({
      ...options,
      endpoint: "https://files.example.test",
    });
    const layer = makeBlobStoreLayer(() => ({
      client: internal,
      presignClient: publicClient,
      bucket: "evidence",
    }));
    const put = await Effect.runPromise(
      Effect.provide(
        createPresignedPutEffect({
          caseId: CASE_ID,
          sha256: "a".repeat(64),
          mime: "text/plain",
          byteLength: 3,
        }),
        layer
      )
    );
    expect(put.url.startsWith("https://files.example.test/evidence/")).toBe(
      true
    );
    expect(put.url).not.toContain("s3.internal.invalid");
    const get = await Effect.runPromise(
      Effect.provide(createPresignedGetEffect(put.uri), layer)
    );
    expect(get.startsWith("https://files.example.test/")).toBe(true);
  });

  it("verifies an uploaded object by reading it through the service", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sha256 = sha256Hex(bytes);
    const uri = `${CASE_ID}/${sha256}`;
    const store = recordingBlobStore({ objects: new Map([[uri, bytes]]) });
    const verified = await provide(
      verifyUploadedObjectEffect({
        uri,
        sha256,
        mime: "text/plain",
        byteLength: 3,
      }),
      store
    );
    expect(verified).toEqual({ sha256, byteLength: 3, sniffedMime: null });
    expect(store.calls.map((call) => call.command)).toEqual([
      "HeadObjectCommand",
      "GetObjectCommand",
    ]);
  });

  it("fails when S3 answers a delete with per-key errors, so a purge cannot report a half-erased Case as done", async () => {
    const store = recordingBlobStore({
      respond: ({ command }) => {
        if (command === "ListObjectsV2Command") {
          return { Contents: [{ Key: `${CASE_ID}/a` }], IsTruncated: false };
        }
        return { Errors: [{ Key: `${CASE_ID}/a`, Code: "AccessDenied" }] };
      },
    });
    await expect(
      provide(deleteCaseArtifactsEffect(CASE_ID), store)
    ).rejects.toThrow(/could not be deleted/);
  });

  it("lists and deletes the objects of one Case only, through the in-memory store", async () => {
    const other = "11111111-1111-4111-8111-111111111111";
    const store = recordingBlobStore({
      objects: new Map([
        [`${CASE_ID}/a`, new Uint8Array([1])],
        [`${CASE_ID}/b/c`, new Uint8Array([2])],
        [`${other}/a`, new Uint8Array([3])],
      ]),
    });
    await provide(deleteCaseArtifactsEffect(CASE_ID), store);
    expect([...store.objects.keys()]).toEqual([`${other}/a`]);
  });

  it("also deletes the Case's export archives, which live under exports/{caseId}/", async () => {
    const other = "11111111-1111-4111-8111-111111111111";
    const store = recordingBlobStore({
      objects: new Map([
        [`${CASE_ID}/a`, new Uint8Array([1])],
        [`exports/${CASE_ID}/job.zip`, new Uint8Array([2])],
        [`exports/${other}/job.zip`, new Uint8Array([3])],
      ]),
    });
    await provide(deleteCaseArtifactsEffect(CASE_ID), store);
    expect([...store.objects.keys()]).toEqual([`exports/${other}/job.zip`]);
  });

  it("deletes every listed key for a Case, page by page", async () => {
    let page = 0;
    const store = recordingBlobStore({
      respond: ({ command, input }) => {
        if (command === "ListObjectsV2Command") {
          const prefix = (input as { Prefix: string }).Prefix;
          if (prefix !== `${CASE_ID}/`) return { IsTruncated: false };
          page += 1;
          return page === 1
            ? {
                Contents: [{ Key: `${CASE_ID}/a` }],
                IsTruncated: true,
                NextContinuationToken: "t1",
              }
            : { Contents: [{ Key: `${CASE_ID}/b` }], IsTruncated: false };
        }
        return {};
      },
    });
    await provide(deleteCaseArtifactsEffect(CASE_ID), store);
    expect(store.calls.map((call) => call.command)).toEqual([
      "ListObjectsV2Command",
      "DeleteObjectsCommand",
      "ListObjectsV2Command",
      "DeleteObjectsCommand",
      "ListObjectsV2Command",
    ]);
  });
});
