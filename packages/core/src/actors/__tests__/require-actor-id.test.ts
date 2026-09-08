import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { optionalActorId, requireActorIdEffect } from "../require-actor-id";

describe("optionalActorId", () => {
  it("returns undefined for absent or blank values", () => {
    expect(optionalActorId(undefined)).toBeUndefined();
    expect(optionalActorId(null)).toBeUndefined();
    expect(optionalActorId("   ")).toBeUndefined();
  });

  it("trims padded actor ids", () => {
    expect(optionalActorId("  test-actor  ")).toBe("test-actor");
  });
});

describe("requireActorIdEffect", () => {
  it("trims padded actor ids", async () => {
    const actorId = await Effect.runPromise(
      requireActorIdEffect("  test-actor  ")
    );
    expect(actorId).toBe("test-actor");
  });

  it("rejects blank actor ids", async () => {
    await expect(
      Effect.runPromise(requireActorIdEffect("   "))
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "actorId is required",
    });
  });
});
