import { describe, expect, it } from "vitest";

import { timestamps, timestamptz } from "../_helpers";

describe("schema _helpers", () => {
  it("exports timestamptz helper and timestamps bundle", () => {
    expect(typeof timestamptz).toBe("function");
    expect(timestamps.createdAt).toBeDefined();
    expect(timestamps.updatedAt).toBeDefined();
  });
});
