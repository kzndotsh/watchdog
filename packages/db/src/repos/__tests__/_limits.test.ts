import { describe, expect, it } from "vitest";

import { clampSearchLimit, MAX_REPO_SEARCH_LIMIT } from "../_limits.ts";

describe("clampSearchLimit", () => {
  it("clamps to [1, MAX_REPO_SEARCH_LIMIT]", () => {
    expect(clampSearchLimit(0)).toBe(1);
    expect(clampSearchLimit(-5)).toBe(1);
    expect(clampSearchLimit(10)).toBe(10);
    expect(clampSearchLimit(MAX_REPO_SEARCH_LIMIT)).toBe(MAX_REPO_SEARCH_LIMIT);
    expect(clampSearchLimit(MAX_REPO_SEARCH_LIMIT + 100)).toBe(
      MAX_REPO_SEARCH_LIMIT
    );
  });

  it("falls back when limit is not finite", () => {
    expect(clampSearchLimit(Number.NaN)).toBe(MAX_REPO_SEARCH_LIMIT);
    expect(clampSearchLimit(Number.POSITIVE_INFINITY)).toBe(
      MAX_REPO_SEARCH_LIMIT
    );
  });
});
