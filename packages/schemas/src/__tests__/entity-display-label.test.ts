import { describe, expect, it } from "vitest";

import { entityDisplayLabel } from "../vocab";

describe("entityDisplayLabel", () => {
  it("trims name and falls back to slug when blank", () => {
    expect(
      entityDisplayLabel({ name: "  Alpha Corp  ", slug: "alpha-corp" })
    ).toBe("Alpha Corp");
    expect(entityDisplayLabel({ name: "  ", slug: "alpha-corp" })).toBe(
      "alpha-corp"
    );
    expect(entityDisplayLabel({ name: "  ", slug: "  alpha-corp  " })).toBe(
      "alpha-corp"
    );
  });
});
