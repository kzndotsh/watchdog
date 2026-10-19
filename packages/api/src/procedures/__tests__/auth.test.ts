import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { SCOPES, type ApiCredential } from "@watchdog/schemas/shared";
import { testActor, testApiKey } from "@watchdog/schemas/testing";

import { router } from "../../router";

const actor = testActor();

function whoamiFor(credential: ApiCredential) {
  return createRouterClient(router, {
    context: { headers: new Headers(), actor, credential },
  }).auth.whoami();
}

describe("auth.whoami", () => {
  it("answers a session with every scope and the organization", async () => {
    expect(await whoamiFor({ kind: "session" })).toEqual({
      credential: "session",
      keyId: null,
      scopes: [...SCOPES],
      organizationId: actor.organizationId,
    });
  });

  it("answers a key with its own scopes (write implies read) and its id", async () => {
    expect(
      await whoamiFor(testApiKey("key-7", ["cases:read", "proposals:write"]))
    ).toEqual({
      credential: "apiKey",
      keyId: "key-7",
      scopes: ["cases:read", "proposals:write"],
      organizationId: actor.organizationId,
    });
  });

  it("answers a read-only key", async () => {
    const result = await whoamiFor(testApiKey("legacy", ["cases:read"]));
    expect(result.scopes).toEqual(["cases:read"]);
  });
});
