import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { ValidationVendorError } from "@watchdog/tools/errors";

import { readArtifactBytesEffect } from "../../../infra/blob";
import { recordingBlobStore } from "../../../infra/blob-store";
import { InternalError, InvalidError } from "../../../infra/tagged-errors";
import { blobToVendorError } from "../collect";

const LIMIT = { maxBytes: 8, reason: "Artifact is over the Cap's input limit" };

describe("blobToVendorError", () => {
  it("shows a Cap the fixed input-limit message for an over-limit artifact", async () => {
    const store = recordingBlobStore({
      objects: new Map([["c/over", new Uint8Array(LIMIT.maxBytes + 1)]]),
    });
    const error = await Effect.runPromise(
      readArtifactBytesEffect("c/over", LIMIT).pipe(
        Effect.flip,
        Effect.provide(store.layer)
      )
    );
    expect(error).toBeInstanceOf(InvalidError);
    const seen = blobToVendorError(error);
    expect(seen).toBeInstanceOf(ValidationVendorError);
    expect(seen.message).toBe(LIMIT.reason);
  });

  it("shows a Cap only the fixed text of a storage failure, never the driver message", async () => {
    const store = recordingBlobStore({
      respond: () => {
        throw new Error("connect ECONNREFUSED 10.0.0.7:9000");
      },
    });
    const error = await Effect.runPromise(
      readArtifactBytesEffect("c/any", LIMIT).pipe(
        Effect.flip,
        Effect.provide(store.layer)
      )
    );
    expect(error).toBeInstanceOf(InternalError);
    const seen = blobToVendorError(error);
    expect(seen.message).toBe("Failed to read the artifact");
    expect(seen.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.7/);
    // The driver detail is kept for the Job's failure log, out of the message.
    expect(seen.cause).toBe(error);
  });
});
