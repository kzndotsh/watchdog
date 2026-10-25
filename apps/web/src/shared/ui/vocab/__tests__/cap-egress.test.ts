import { describe, expect, it } from "vitest";

import { capEgressLabel } from "@watchdog/schemas/caps";

describe("capEgressLabel", () => {
  it("names a Cap that stays on the install", () => {
    expect(capEgressLabel(["local"])).toBe("Local only");
  });

  it("names every class a Cap contacts", () => {
    expect(capEgressLabel(["target", "public_lookup"])).toBe(
      "The target itself, Public lookups"
    );
  });
});
