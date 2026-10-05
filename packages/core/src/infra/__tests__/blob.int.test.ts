import { randomUUID } from "node:crypto";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  assertUploadedObjectEffect,
  blobStoreLayer,
  createPresignedGetEffect,
  deleteCaseArtifactsEffect,
  readArtifactBytesEffect,
  uploadArtifactEffect,
} from "../blob";
import type { BlobStore } from "../blob-store";

/** The live Layer over the local S3 container (`just up`, SeaweedFS). */
function runLive<A, E>(effect: Effect.Effect<A, E, BlobStore>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, blobStoreLayer));
}

describe("blobStoreLayer (local S3)", () => {
  it("uploads, verifies, reads, presigns and deletes a Case's artifacts", async () => {
    const caseId = randomUUID();
    const bytes = new TextEncoder().encode(`blob int ${caseId}`);

    const uploaded = await runLive(
      uploadArtifactEffect({
        caseId,
        bytes,
        mime: "text/plain",
        name: "note.txt",
      })
    );
    await runLive(assertUploadedObjectEffect(uploaded));

    const read = await runLive(readArtifactBytesEffect(uploaded.uri));
    expect(new TextDecoder().decode(read)).toBe(`blob int ${caseId}`);

    const url = await runLive(createPresignedGetEffect(uploaded.uri));
    const fetched = await fetch(url);
    expect(await fetched.text()).toBe(`blob int ${caseId}`);

    await runLive(deleteCaseArtifactsEffect(caseId));
    await expect(
      runLive(readArtifactBytesEffect(uploaded.uri))
    ).rejects.toMatchObject({ _tag: "InvalidError" });
  });
});
