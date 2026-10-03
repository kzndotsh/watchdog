import { ORPCError, createRouterClient } from "@orpc/server";
import type { RouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { putCredentialSlotEffect, runDomain } from "@watchdog/core";
import type { ApiActor } from "@watchdog/schemas";
import { buildEntityCreateOp } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEntity, testDb } from "@watchdog/test-db";
import {
  TEST_ACTOR_ID,
  TEST_ORGANIZATION_ID,
  testId,
} from "@watchdog/test-kit";

import type { ApiContext } from "../context";
import { router } from "../router";

function routerClient(
  context: Partial<ApiContext> = {}
): RouterClient<typeof router> {
  const actor: ApiActor = {
    userId: TEST_ACTOR_ID,
    email: "agent@test.local",
    name: "Agent",
    organizationId: TEST_ORGANIZATION_ID,
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

  it("graph.write reports an Entity id already in use as HTTP 409 CONFLICT", async () => {
    const cased = await seedCase(testDb);
    const entity = await seedEntity(testDb, cased.id, { id: testId(25) });
    await expect(
      routerClient().graph.write({
        caseId: cased.id,
        userOverride: true,
        patch: [
          buildEntityCreateOp("Dup", "dup-slug", "person", { id: entity.id }),
        ],
      })
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });
});
