import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { recordingBlobStore } from "../../infra/blob-store";
import { MULTIPART_PART_BYTES, multipartSinkEffect } from "../multipart-sink";

function sinkOver(answer: (command: string) => unknown) {
  const store = recordingBlobStore({
    respond: ({ command }) => answer(command),
  });
  return { store, layer: store.layer };
}

describe("multipartSinkEffect (recorded store)", () => {
  it("refuses a part the store answers without an ETag, before more is uploaded", async () => {
    const { store, layer } = sinkOver((command) =>
      command === "CreateMultipartUploadCommand" ? { UploadId: "u1" } : {}
    );

    const failure = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* upload() {
          const sink = yield* multipartSinkEffect(
            "exports/c/j.zip",
            "application/zip"
          );
          return yield* Effect.promise(async () => {
            try {
              await sink.write(new Uint8Array(MULTIPART_PART_BYTES));
              return null;
            } catch (error) {
              return error;
            }
          });
        })
      ).pipe(Effect.provide(layer))
    );

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("no ETag");
    const commands = store.calls.map((call) => call.command);
    expect(commands).toContain("UploadPartCommand");
    // The scope closed on the failure: the upload was aborted, never completed.
    expect(commands).toContain("AbortMultipartUploadCommand");
    expect(commands).not.toContain("CompleteMultipartUploadCommand");
  });
});
