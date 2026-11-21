import { describe, expect, it } from "vitest";

import { actorLabelForPersist } from "../actor-label-snapshot";

describe("actorLabelForPersist", () => {
  it("trims and blank-nulls persisted labels", () => {
    expect(actorLabelForPersist("  api-key:cli  ")).toBe("api-key:cli");
    expect(actorLabelForPersist("   ")).toBeNull();
    expect(actorLabelForPersist(null)).toBeNull();
    expect(actorLabelForPersist(undefined)).toBeNull();
  });
});
