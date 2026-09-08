import { describe, expect, it } from "vitest";

import { queryEnabledFlag } from "@/shared/lib/query-enabled";

describe("queryEnabledFlag", () => {
  it("treats undefined and true as enabled", () => {
    expect(queryEnabledFlag(undefined)).toBe(true);
    expect(queryEnabledFlag(true)).toBe(true);
  });

  it("treats false as disabled", () => {
    expect(queryEnabledFlag(false)).toBe(false);
  });

  it("treats function enabled as enabled for UX helpers", () => {
    expect(queryEnabledFlag(() => false)).toBe(true);
  });
});
