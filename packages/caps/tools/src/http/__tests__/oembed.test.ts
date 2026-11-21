import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../http-client-layer";
import {
  fetchOembedEffect,
  isOembedUrl,
  matchOembedVendor,
} from "../oembed.ts";

describe("matchOembedVendor", () => {
  it("matches youtube and rejects an unknown host", () => {
    expect(
      matchOembedVendor("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe("youtube");
    expect(isOembedUrl("https://mailhost.test/video")).toBe(false);
  });
});

describe("fetchOembedEffect", () => {
  it.effect("rejects non-http(s) URLs", () =>
    Effect.gen(function* rejectBadSchemeGen() {
      const outcome = yield* Effect.result(
        fetchOembedEffect("file:///etc/passwd", AbortSignal.timeout(5000), {
          userAgent: "watchdog-test",
        })
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
