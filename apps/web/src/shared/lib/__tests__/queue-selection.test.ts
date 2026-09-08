import { describe, expect, it } from "vitest";

import { resolveQueueSelection } from "../queue-selection.ts";

describe("resolveQueueSelection", () => {
  it("keeps the URL id when it is in the rows", () => {
    expect(resolveQueueSelection("b", [{ id: "a" }, { id: "b" }])).toBe("b");
  });

  it("falls back to the first row", () => {
    expect(resolveQueueSelection("missing", [{ id: "a" }])).toBe("a");
  });

  it("holds a missing URL id when asked", () => {
    expect(
      resolveQueueSelection("new", [{ id: "a" }], { holdMissingUrlId: true })
    ).toBe("new");
  });

  it("trims padded URL ids before matching rows", () => {
    expect(resolveQueueSelection("  b  ", [{ id: "a" }, { id: "b" }])).toBe(
      "b"
    );
  });

  it("treats whitespace-only URL id as absent", () => {
    expect(resolveQueueSelection("   ", [{ id: "a" }])).toBe("a");
  });
});
