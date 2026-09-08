import { describe, expect, it } from "vitest";

import { c99LookupInput } from "../input";

describe("c99.lookup input", () => {
  it("requires host and accepts optional realtime and entityId", () => {
    expect(
      c99LookupInput.parse({
        host: "example.com",
        realtime: true,
        entityId: "00000000-0000-4000-8000-000000000001",
      })
    ).toMatchObject({ host: "example.com", realtime: true });
  });

  it("rejects invalid host seeds", () => {
    expect(() => c99LookupInput.parse({ host: "not a host" })).toThrow();
  });
});
