import { describe, expect, it } from "vitest";

import {
  actorHandleFromUser,
  formatActorLabel,
  maskEmailForActor,
} from "../format-actor-label";

describe("maskEmailForActor", () => {
  it("keeps the first local character and domain", () => {
    expect(maskEmailForActor("ada@mailhost.test")).toBe("a***@mailhost.test");
  });
});

describe("actorHandleFromUser", () => {
  it("slugs the display name", () => {
    expect(
      actorHandleFromUser({ name: "Ada Lovelace", email: "ada@mailhost.test" })
    ).toBe("ada-lovelace");
  });

  it("falls back to the email local-part", () => {
    expect(actorHandleFromUser({ name: "  ", email: "admin@kzn.sh" })).toBe(
      "admin"
    );
  });
});

describe("formatActorLabel", () => {
  it("maps a user to a handle without an @ prefix", () => {
    expect(
      formatActorLabel("user-1", {
        name: "Ada",
        email: "ada@mailhost.test",
      })
    ).toBe("ada");
  });

  it("keeps api-key labels", () => {
    expect(formatActorLabel("user-1", null, "api-key:cli")).toBe("api-key:cli");
    expect(formatActorLabel("api-key:cli", null)).toBe("api-key:cli");
  });

  it("falls back to actorId when the user is missing", () => {
    expect(formatActorLabel("test-actor")).toBe("test-actor");
  });
});
