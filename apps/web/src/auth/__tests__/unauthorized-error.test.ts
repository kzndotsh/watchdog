import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { isUnauthorizedFailure } from "@/auth/unauthorized-error";

describe("isUnauthorizedFailure", () => {
  it("is oRPC's UNAUTHORIZED, or a Better Auth call answering exactly Unauthorized", () => {
    expect(isUnauthorizedFailure(new ORPCError("UNAUTHORIZED"))).toBe(true);
    expect(isUnauthorizedFailure(new Error("Unauthorized"))).toBe(true);
  });

  it("is not a refusal for a signed-in caller, nor a message that only mentions the word", () => {
    expect(isUnauthorizedFailure(new ORPCError("FORBIDDEN"))).toBe(false);
    expect(
      isUnauthorizedFailure(new Error("Forbidden: unauthorized caller"))
    ).toBe(false);
  });
});
