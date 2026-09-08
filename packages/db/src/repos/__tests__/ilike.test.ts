import { describe, it, expect } from "vitest";

import {
  containsPattern,
  distinctSlugContainsPattern,
  entitySlugIlikePatterns,
} from "../_ilike.ts";

describe("containsPattern", () => {
  it("wraps cleaned term", () => {
    expect(containsPattern("alice")).toBe("%alice%");
  });

  it("strips wildcard characters", () => {
    expect(containsPattern("a%_b")).toBe("%ab%");
  });

  it("returns null when nothing remains", () => {
    expect(containsPattern("%%%")).toBe(null);
    expect(containsPattern("  ")).toBe(null);
  });
});

describe("distinctSlugContainsPattern", () => {
  it("returns slug pattern when slugified text differs", () => {
    expect(distinctSlugContainsPattern("Unnamed Host", "unnamed-host")).toBe(
      "%unnamed-host%"
    );
  });

  it("returns null when slug pattern matches raw pattern", () => {
    expect(distinctSlugContainsPattern("ada", "ada")).toBe(null);
  });
});

describe("entitySlugIlikePatterns", () => {
  it("includes slug pattern when slugified text differs", () => {
    expect(entitySlugIlikePatterns("Unnamed Host")).toEqual([
      "%Unnamed Host%",
      "%unnamed-host%",
    ]);
  });

  it("returns single pattern when slug matches raw", () => {
    expect(entitySlugIlikePatterns("ada")).toEqual(["%ada%"]);
  });
});
