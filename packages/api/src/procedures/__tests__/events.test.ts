import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listEventsForEntityEffect } = vi.hoisted(() => ({
  listEventsForEntityEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listEventsForEntityEffect,
    createEventEffect: vi.fn(),
    updateEventEffect: vi.fn(),
    deleteEventEffect: vi.fn(),
  };
});

import { list } from "../events";

const actor = { userId: "u1", email: "a@test.local", name: "Agent" };

describe("events procedures", () => {
  it("lists events for an entity", async () => {
    listEventsForEntityEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000030",
          entityId: "00000000-0000-4000-8000-000000000010",
          when: "2026-01-01T12:00:00.000Z",
          what: "Seen online",
          where: null,
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

    await expect(
      client.list({
        caseId: "00000000-0000-4000-8000-000000000001",
        entityId: "00000000-0000-4000-8000-000000000010",
      })
    ).resolves.toHaveLength(1);
  });
});
