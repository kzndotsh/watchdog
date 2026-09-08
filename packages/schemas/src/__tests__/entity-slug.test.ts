import { describe, expect, it } from "vitest";

import { entitySlugSchema } from "../primitives";

describe("entitySlugSchema", () => {
  it("slugifies and accepts normalized slugs", () => {
    expect(entitySlugSchema.parse("Alpha Corp")).toBe("alpha-corp");
    expect(entitySlugSchema.parse("alpha-corp")).toBe("alpha-corp");
  });

  it("rejects values that slugify to empty", () => {
    expect(() => entitySlugSchema.parse("!!!")).toThrow();
  });
});
