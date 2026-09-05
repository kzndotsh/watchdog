import { describe, expect, it } from "vitest";

import { labelForActor } from "../resolve-actor-labels";

describe("labelForActor", () => {
  it("labels from the users map", () => {
    const users = new Map([
      ["user-1", { name: "Ada", email: "ada@mailhost.test" }],
    ]);
    expect(labelForActor("user-1", users)).toBe("ada");
  });

  it("prefers a stored label when the user is missing", () => {
    expect(labelForActor("missing", new Map(), "api-key:cli")).toBe(
      "api-key:cli"
    );
  });
});
