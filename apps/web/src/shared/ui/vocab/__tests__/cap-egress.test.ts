import { describe, expect, it } from "vitest";

import { capEgressLabel } from "@/shared/ui/vocab/cap-egress.lib";

describe("capEgressLabel", () => {
  it("labels third-party egress", () => {
    expect(capEgressLabel("third_party")).toBe("Third party");
    expect(capEgressLabel(true)).toBe("Third party");
  });

  it("labels absent egress as None", () => {
    expect(capEgressLabel("none")).toBe("None");
    expect(capEgressLabel(null)).toBe("None");
  });
});
