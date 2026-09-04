import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listCredentialSlotsEffect } = vi.hoisted(() => ({
  listCredentialSlotsEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listCredentialSlotsEffect,
    putCredentialSlotEffect: vi.fn(),
    deleteCredentialEffect: vi.fn(),
  };
});

import { list } from "../credentials";

const actor = { userId: "u1", email: "a@test.local", name: "Agent" };

describe("credentials procedures", () => {
  it("lists credential slots for the actor", async () => {
    listCredentialSlotsEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          name: "AI_COMPAT_API_KEY",
          label: "AI",
          description: "Compat key",
          configured: true,
          updatedAt: null,
        },
      ])
    );

    const client = createRouterClient(
      { list },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.list()).resolves.toHaveLength(1);
    expect(listCredentialSlotsEffect).toHaveBeenCalledWith("u1");
  });
});
