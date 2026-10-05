import { describe, expect, it } from "vitest";

import { testActor } from "@watchdog/schemas/testing";

import { actorLabelFromActor } from "../actor-label";

describe("actorLabelFromActor", () => {
  it("stores api-key display names and ignores session names", () => {
    expect(actorLabelFromActor(testActor({ name: "api-key:cli" }))).toBe(
      "api-key:cli"
    );
    expect(actorLabelFromActor(testActor({ name: "Ada" }))).toBeUndefined();
  });
});
