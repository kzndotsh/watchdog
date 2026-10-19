import { describe, expect, it } from "vitest";

import { testActor, testApiKey } from "@watchdog/schemas/testing";

import { actorLabelFromContext, graphActorFromContext } from "../actor-label";

const key = testApiKey("key-1");
const session = { kind: "session" } as const;

describe("actorLabelFromContext", () => {
  it("stores the display name of a key and nothing for a session", () => {
    expect(
      actorLabelFromContext({
        actor: testActor({ name: "api-key:cli" }),
        credential: key,
      })
    ).toBe("api-key:cli");
    expect(
      actorLabelFromContext({
        actor: testActor({ name: "Ada" }),
        credential: session,
      })
    ).toBeUndefined();
  });

  it("decides on the credential, not on the name", () => {
    expect(
      actorLabelFromContext({
        actor: testActor({ name: "api-key:lookalike" }),
        credential: session,
      })
    ).toBeUndefined();
  });
});

describe("graphActorFromContext", () => {
  it("carries the key id of a key and none for a session", () => {
    const actor = testActor({ name: "api-key:cli" });
    expect(graphActorFromContext({ actor, credential: key })).toEqual({
      actorId: actor.userId,
      actorLabel: "api-key:cli",
      actorKeyId: "key-1",
    });
    expect(
      graphActorFromContext({ actor, credential: session }).actorKeyId
    ).toBeUndefined();
  });
});
