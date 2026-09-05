import { describe, expect, it } from "vitest";

import { actorLabelFromActor } from "../actor-label";

describe("actorLabelFromActor", () => {
  it("stores api-key display names and ignores session names", () => {
    expect(
      actorLabelFromActor({
        userId: "u1",
        email: "a@test.local",
        name: "api-key:cli",
        organizationId: "org-test",
      })
    ).toBe("api-key:cli");
    expect(
      actorLabelFromActor({
        userId: "u1",
        email: "a@test.local",
        name: "Ada",
        organizationId: "org-test",
      })
    ).toBeUndefined();
  });
});
