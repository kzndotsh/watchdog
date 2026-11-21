import { describe, it, expect } from "vitest";

import { slugForCaseName } from "../cases.ts";

describe("slugForCaseName", () => {
  it("kebab-cases the display name", () => {
    expect(slugForCaseName("Boy Moment")).toBe("boy-moment");
    expect(slugForCaseName("  Operation  ")).toBe("operation");
  });

  it("empty when the name has no letters or numbers", () => {
    expect(slugForCaseName("!!!")).toBe("");
    expect(slugForCaseName("   ")).toBe("");
  });
});
