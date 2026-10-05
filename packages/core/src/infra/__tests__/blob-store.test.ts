import { Effect, Exit, Layer, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

import {
  assertUploadedObjectEffect,
  createPresignedGetEffect,
  createPresignedPutEffect,
  deleteCaseArtifactsEffect,
  readArtifactBytesEffect,
  uploadArtifactEffect,
} from "../blob";
import { BlobStore, recordingBlobStore } from "../blob-store";

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
    const get = await provide(createPresignedGetEffect(put.uri), store);
    expect(get).toContain(put.uri);
    expect(store.calls).toHaveLength(0);
  });

  it("checks uploaded object metadata through the service", async () => {
    const sha256 = "b".repeat(64);
    const store = recordingBlobStore({
      respond: () => ({
        Metadata: { sha256 },
        ContentLength: 3,
        ContentType: "text/plain",
      }),
    });
    await provide(
      assertUploadedObjectEffect({
        uri: `${CASE_ID}/${sha256}`,
        sha256,
        mime: "text/plain",
        byteLength: 3,
      }),
      store
    );
    expect(store.calls.map((call) => call.command)).toEqual([
      "HeadObjectCommand",
    ]);
  });

  it("deletes every listed key for a Case, page by page", async () => {
    let page = 0;
    const store = recordingBlobStore({
      respond: ({ command }) => {
        if (command === "ListObjectsV2Command") {
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
    ]);
  });
});
