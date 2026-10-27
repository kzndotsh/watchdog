import { randomUUID } from "node:crypto";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { asCaseId } from "@watchdog/schemas/shared";

import {
  blobStoreLayer,
  createPresignedGetEffect,
  deleteCaseArtifactsEffect,
  readArtifactBytesEffect,
  uploadArtifactEffect,
  verifyUploadedObjectEffect,
} from "../blob";
import type { BlobStore } from "../blob-store";
import { warmObjectStore } from "./helpers/object-store-ready";

/** The live Layer over the local S3 container (`just up`, SeaweedFS). */
function runLive<A, E>(effect: Effect.Effect<A, E, BlobStore>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, blobStoreLayer));
}

warmObjectStore();

describe("blobStoreLayer (local S3)", () => {
  it("uploads, verifies, reads, presigns and deletes a Case's artifacts", async () => {
    const caseId = asCaseId(randomUUID());
    const bytes = new TextEncoder().encode(`blob int ${caseId}`);

    const uploaded = await runLive(
      uploadArtifactEffect({
        caseId,
        bytes,
        mime: "text/plain",
        name: "note.txt",
      })
    );
    await runLive(verifyUploadedObjectEffect(uploaded));

    const read = await runLive(readArtifactBytesEffect(uploaded.uri));
    expect(new TextDecoder().decode(read)).toBe(`blob int ${caseId}`);

    const url = await runLive(createPresignedGetEffect(uploaded.uri));
    const fetched = await fetch(url);
    expect(await fetched.text()).toBe(`blob int ${caseId}`);

    await runLive(deleteCaseArtifactsEffect(caseId));
    await expect(
      runLive(readArtifactBytesEffect(uploaded.uri))
    ).rejects.toMatchObject({
      _tag: "InternalError",
      reason: "Failed to read the artifact",
    });
  });

  it("refuses an artifact over the read limit and reads one at it", async () => {
    const caseId = asCaseId(randomUUID());
    const limit = { maxBytes: 4096, reason: "Over the fixed limit" };
    const atLimit = await runLive(
      uploadArtifactEffect({
        caseId,
        bytes: new Uint8Array(limit.maxBytes).fill(1),
        mime: "application/octet-stream",
        name: "at.bin",
      })
    );
    const over = await runLive(
      uploadArtifactEffect({
        caseId,
        bytes: new Uint8Array(limit.maxBytes + 1).fill(2),
        mime: "application/octet-stream",
        name: "over.bin",
      })
    );
    const read = await runLive(readArtifactBytesEffect(atLimit.uri, limit));
    expect(read.byteLength).toBe(limit.maxBytes);
    await expect(
      runLive(readArtifactBytesEffect(over.uri, limit))
    ).rejects.toMatchObject({ _tag: "InvalidError", reason: limit.reason });
    await runLive(deleteCaseArtifactsEffect(caseId));
  });
});
