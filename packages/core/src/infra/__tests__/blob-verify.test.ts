import { Readable } from "node:stream";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { MAX_UPLOAD_BYTES } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";

import { sha256Hex, verifyUploadedObjectEffect } from "../blob";
import { recordingBlobStore } from "../blob-store";

const CASE_ID = testCaseId(1);
const BYTES = new TextEncoder().encode("evidence bytes");
const SHA = sha256Hex(BYTES);
const URI = `${CASE_ID}/${SHA}/note.txt`;

type Store = ReturnType<typeof recordingBlobStore>;

function verify(
  store: Store,
  overrides: Partial<{
    sha256: string;
    mime: string;
    byteLength: number;
  }> = {}
) {
  return Effect.runPromise(
    Effect.provide(
      Effect.flip(
        verifyUploadedObjectEffect({
          uri: URI,
          sha256: SHA,
          mime: "text/plain",
          byteLength: BYTES.byteLength,
          ...overrides,
        })
      ),
      store.layer
    )
  );
}

function verifyOk(store: Store) {
  return Effect.runPromise(
    Effect.provide(
      verifyUploadedObjectEffect({
        uri: URI,
        sha256: SHA,
        mime: "text/plain",
        byteLength: BYTES.byteLength,
      }),
      store.layer
    )
  );
}

describe("verifyUploadedObjectEffect", () => {
  it("returns the hash it computed from the stored bytes", async () => {
    const store = recordingBlobStore({ objects: new Map([[URI, BYTES]]) });
    await expect(verifyOk(store)).resolves.toEqual({
      sha256: SHA,
      byteLength: BYTES.byteLength,
      sniffedMime: null,
    });
  });

  it("refuses bytes that do not hash to the declared value", async () => {
    const other = new TextEncoder().encode("evidence bytez");
    const store = recordingBlobStore({ objects: new Map([[URI, other]]) });
    await expect(verify(store)).resolves.toMatchObject({
      _tag: "InvalidError",
      reason: expect.stringContaining("sha256"),
    });
  });

  it("refuses a stored size that differs from the declared size before reading", async () => {
    const store = recordingBlobStore({ objects: new Map([[URI, BYTES]]) });
    await expect(
      verify(store, { byteLength: BYTES.byteLength + 1 })
    ).resolves.toMatchObject({ _tag: "InvalidError" });
    expect(store.calls.map((call) => call.command)).toEqual([
      "HeadObjectCommand",
    ]);
  });

  it("refuses a declared size above the upload limit", async () => {
    const store = recordingBlobStore({
      respond: () => ({ ContentLength: MAX_UPLOAD_BYTES + 1 }),
    });
    await expect(
      verify(store, { byteLength: MAX_UPLOAD_BYTES + 1 })
    ).resolves.toMatchObject({ _tag: "InvalidError" });
    expect(store.calls.map((call) => call.command)).toEqual([
      "HeadObjectCommand",
    ]);
  });

  it("stops reading a stream that runs past the declared size", async () => {
    const store = recordingBlobStore({
      respond: ({ command }) => {
        if (command === "HeadObjectCommand") {
          return { ContentLength: BYTES.byteLength };
        }
        return {
          Body: Readable.from([BYTES, BYTES, BYTES]),
        };
      },
    });
    await expect(verify(store)).resolves.toMatchObject({
      _tag: "InvalidError",
      reason: expect.stringContaining("size"),
    });
  });

  it("refuses a stored Content-Type that differs from the declared one", async () => {
    const store = recordingBlobStore({
      objects: new Map([[URI, BYTES]]),
      respond: ({ command }) =>
        command === "HeadObjectCommand"
          ? { ContentLength: BYTES.byteLength, ContentType: "image/png" }
          : undefined,
    });
    await expect(verify(store)).resolves.toMatchObject({
      _tag: "InvalidError",
      reason: expect.stringContaining("Content-Type"),
    });
  });

  it("refuses bytes whose signature contradicts the declared type", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const sha256 = sha256Hex(png);
    const store = recordingBlobStore({ objects: new Map([[URI, png]]) });
    await expect(
      verify(store, { sha256, mime: "application/pdf", byteLength: png.length })
    ).resolves.toMatchObject({
      _tag: "InvalidError",
      reason: expect.stringContaining("declared type"),
    });
  });

  it("refuses a missing object as caller input", async () => {
    const store = recordingBlobStore();
    await expect(verify(store)).resolves.toMatchObject({
      _tag: "InvalidError",
      reason: expect.stringContaining("not found"),
    });
  });

  it("reports an unreachable store as an internal failure, not caller input", async () => {
    const store = recordingBlobStore({
      respond: () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    await expect(verify(store)).resolves.toMatchObject({
      _tag: "InternalError",
    });
  });
});
