import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { requireTrimmedGraphId } from "../guards";

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
});
