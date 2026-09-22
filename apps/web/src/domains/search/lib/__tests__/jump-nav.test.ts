import { describe, expect, it } from "vitest";

import { jumpNavItems } from "../jump-nav.ts";

describe("jumpNavItems", () => {
  it("includes Dashboard and omits the UI kit", () => {
    const items = jumpNavItems();
    expect(items.some((item) => item.to === "/")).toBe(true);
    expect(items.some((item) => item.label === "UI kit")).toBe(false);
  });
});
