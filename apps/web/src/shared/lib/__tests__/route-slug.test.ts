import { describe, expect, it } from "vitest";

import {
  normalizeEntitySlug,
  normalizeRouteSegment,
} from "@/shared/lib/route-slug";

describe("normalizeRouteSegment", () => {
  it("trims padded segments", () => {
    expect(normalizeRouteSegment("  sign-in  ")).toBe("sign-in");
    expect(normalizeRouteSegment("  inv-test-1  ")).toBe("inv-test-1");
  });

  it("preserves underscores in opaque ids", () => {
    expect(normalizeRouteSegment("inv_test_1")).toBe("inv_test_1");
  });

  it("returns undefined for blank segments", () => {
    expect(normalizeRouteSegment("   ")).toBeUndefined();
    expect(normalizeRouteSegment("")).toBeUndefined();
  });
});

describe("normalizeEntitySlug", () => {
  it("trims padded slugs", () => {
    expect(normalizeEntitySlug("  acme-corp  ")).toBe("acme-corp");
  });

  it("slugifies display-style names", () => {
    expect(normalizeEntitySlug("Alpha Corp")).toBe("alpha-corp");
  });

  it("returns undefined for blank slugs", () => {
    expect(normalizeEntitySlug("   ")).toBeUndefined();
    expect(normalizeEntitySlug("")).toBeUndefined();
    expect(normalizeEntitySlug("!!!")).toBeUndefined();
  });
});
