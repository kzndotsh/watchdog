import { describe, expect, it } from "vitest";

import {
  DEFAULT_ALLOWED_EGRESS,
  allowedEgressSchema,
  blockedEgressClasses,
  formatEgressBlock,
  normalizeAllowedEgress,
} from "../egress-class";

describe("allowed egress", () => {
  it("defaults to local and target", () => {
    expect(DEFAULT_ALLOWED_EGRESS).toEqual(["local", "target"]);
  });

  it("lists each class once", () => {
    expect(
      allowedEgressSchema.safeParse(["local", "local", "local"]).success
    ).toBe(false);
  });

  it("always includes local", () => {
    expect(allowedEgressSchema.safeParse(["target"]).success).toBe(false);
    expect(allowedEgressSchema.safeParse(["local", "model"]).success).toBe(
      true
    );
    expect(normalizeAllowedEgress(["model", "target"])).toEqual([
      "local",
      "target",
      "model",
    ]);
  });

  it("refuses an unknown class", () => {
    expect(allowedEgressSchema.safeParse(["local", "everything"]).success).toBe(
      false
    );
  });
});

describe("blockedEgressClasses", () => {
  it("names the needed classes the Case does not allow", () => {
    expect(
      blockedEgressClasses(
        ["target", "public_lookup", "account_lookup"],
        ["local", "target"]
      )
    ).toEqual(["public_lookup", "account_lookup"]);
  });

  it("never blocks local work", () => {
    expect(blockedEgressClasses(["local"], [])).toEqual([]);
  });

  it("passes when every class is allowed", () => {
    expect(
      blockedEgressClasses(["public_lookup"], ["local", "public_lookup"])
    ).toEqual([]);
  });
});

describe("formatEgressBlock", () => {
  it("names the classes, the destinations and who can allow it", () => {
    const reason = formatEgressBlock({
      capabilityId: "network.shodan.lookup",
      classes: ["account_lookup"],
      destinations: ["api.shodan.io"],
    });
    expect(reason).toContain("Account lookups");
    expect(reason).toContain("api.shodan.io");
    expect(reason).toContain("network.shodan.lookup");
    expect(reason).toContain("owner or admin");
  });
});
