import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listEdgesForEntityEffect } = vi.hoisted(() => ({
  listEdgesForEntityEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listEdgesForEntityEffect,
    listEdgesForCaseEffect: vi.fn(),
    createEdgeEffect: vi.fn(),
    updateEdgeEffect: vi.fn(),
    deleteEdgeEffect: vi.fn(),
  };
});

import { list } from "../edges";

const actor = { userId: "u1", email: "a@test.local", name: "Agent" };

describe("edges procedures", () => {
  it("lists edges for an entity", async () => {
    listEdgesForEntityEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000020",
          fromId: "00000000-0000-4000-8000-000000000010",
          toId: "00000000-0000-4000-8000-000000000011",
          predicate: "related_to",
          confidence: "unverified",
          notes: null,
          evidenceIds: [],
          peerId: "00000000-0000-4000-8000-000000000011",
          peerName: "Bob",
          peerSlug: "bob",
          peerKind: "person",
          direction: "out",
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
