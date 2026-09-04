import { ORPCError, createRouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { putCredentialSlotEffect, runDomain } from "@watchdog/core";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { resetTestDb } from "@watchdog/test-kit/db";

import type { ApiActor, ApiContext } from "../context";
import { router } from "../router";

function routerClient(
  context: Partial<ApiContext> = {}
): ReturnType<typeof createRouterClient<typeof router>> {
  const actor: ApiActor = {
    userId: TEST_ACTOR_ID,
    email: "agent@test.local",
    name: "Agent",
  };
  return createRouterClient(router, {
    context: {
      headers: new Headers(),
      actor,
      authMethod: "apiKey",
      ...context,
    },
  });
}

describe("oRPC router (in-process)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("health is public", async () => {
    const client = createRouterClient(router, {
      context: { headers: new Headers(), actor: null },
    });
    await expect(client.health()).resolves.toEqual({
      ok: true,
      service: "watchdog",
    });
  });

  it("authed procedures reject missing actor", async () => {
    const client = createRouterClient(router, {
      context: { headers: new Headers(), actor: null },
    });
    await expect(client.credentials.list()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ORPCError && error.code === "UNAUTHORIZED"
    );
  });

  it("credentials.list returns configured slots via procedure layer", async () => {
    await runDomain(
      putCredentialSlotEffect({
        userId: TEST_ACTOR_ID,
        name: "AI_COMPAT_API_KEY",
        secret: "sk-test",
      })
    );
    const slots = await routerClient().credentials.list();
    const slot = slots.find((row) => row.name === "AI_COMPAT_API_KEY");
    expect(slot?.configured).toBe(true);
    expect(JSON.stringify(slots)).not.toMatch(/sk-test/);
  });

  it("rejects invalid credential input before core", async () => {
    await expect(
      routerClient().credentials.put({
        name: "AI_COMPAT_API_KEY",
        secret: "",
      })
    ).rejects.toSatisfy((error: unknown) => error instanceof ORPCError);
  });
});
