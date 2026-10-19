import { describe, expect, it } from "vitest";

import {
  isStaleVersionError,
  staleVersionMessage,
} from "@/shared/lib/stale-version";

describe("isStaleVersionError", () => {
  it("recognises the API's stale_version data", () => {
    expect(
      isStaleVersionError({
        code: "CONFLICT",
        status: 409,
        message: "x",
        data: { code: "stale_version", currentVersion: 3 },
      })
    ).toBe(true);
  });

  it("recognises the fixed message when the data did not survive a server function", () => {
    expect(
      isStaleVersionError(new Error("Entity changed since you opened it"))
    ).toBe(true);
  });

  it("does not take another conflict or failure for a stale edit", () => {
    expect(
      isStaleVersionError({ code: "CONFLICT", data: { code: "conflict" } })
    ).toBe(false);
    expect(isStaleVersionError(new Error("Slug already exists"))).toBe(false);
    expect(isStaleVersionError("changed since you opened it")).toBe(false);
    expect(isStaleVersionError(null)).toBe(false);
  });
});

describe("staleVersionMessage", () => {
  it("names the thing that changed", () => {
    expect(staleVersionMessage("claim")).toBe(
      "This claim changed since you opened it."
    );
  });
});
