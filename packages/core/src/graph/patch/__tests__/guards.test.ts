import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  MAX_ECHOED_ID_CHARS,
  NotFoundError,
} from "../../../infra/tagged-errors";
import { requireTrimmedCaseIdEffect, requireTrimmedGraphId } from "../guards";

describe("graph patch guards", () => {
  it("requireTrimmedGraphId accepts padded UUIDs", async () => {
    const id = testId(10);
    const result = await Effect.runPromise(
      requireTrimmedGraphId(`  ${id}  `, "Entity")
    );
    expect(result).toBe(id);
  });

  it("requireTrimmedGraphId rejects non-uuid strings", async () => {
    await expect(
      Effect.runPromise(requireTrimmedGraphId("host-footprint", "Entity"))
    ).rejects.toMatchObject({
      _tag: "NotFoundError",
    });
  });

  it("requireTrimmedGraphId echoes a trimmed, length-bounded id", async () => {
    const hostile = `   ${"x".repeat(5000)}   `;
    const failure = await Effect.runPromise(
      Effect.flip(requireTrimmedGraphId(hostile, "Entity"))
    );
    if (!(failure instanceof NotFoundError)) {
      expect.unreachable("expected NotFoundError");
    }
    const echoed = failure.id;
    expect(echoed.length).toBeLessThanOrEqual(MAX_ECHOED_ID_CHARS);
    expect(echoed).toBe(echoed.trim());
    expect(echoed.startsWith("xxx")).toBe(true);
  });

  it("requireTrimmedCaseIdEffect bounds the echoed id too", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(requireTrimmedCaseIdEffect("y".repeat(5000)))
    );
    if (!(failure instanceof NotFoundError)) {
      expect.unreachable("expected NotFoundError");
    }
    expect(failure.id.length).toBeLessThanOrEqual(MAX_ECHOED_ID_CHARS);
  });
});
