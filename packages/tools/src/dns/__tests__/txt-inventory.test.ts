import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { fetchTxtInventoryEffect } from "../txt-inventory";

const { mockResolver } = vi.hoisted(() => ({
  mockResolver: {
    resolveTxt: vi.fn(),
  },
}));

vi.mock("../abortable-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../abortable-resolver")>();
  return {
    ...actual,
    runAbortableResolver: (
      _signal: AbortSignal,
      _message: string,
      body: (resolver: typeof mockResolver) => Effect.Effect<unknown>
    ) => body(mockResolver),
  };
});

describe("fetchTxtInventoryEffect", () => {
  it.effect("rejects invalid hostnames", () =>
    Effect.gen(function* rejectInvalidHostGen() {
      const outcome = yield* Effect.result(
        fetchTxtInventoryEffect("not a host!", AbortSignal.timeout(5000))
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    })
  );
});
