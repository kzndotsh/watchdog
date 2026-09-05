import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listIdentifiersForEntityEffect } = vi.hoisted(() => ({
  listIdentifiersForEntityEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listIdentifiersForEntityEffect,
    listIdentifiersForCaseEffect: vi.fn(),
    createIdentifierEffect: vi.fn(),
    updateIdentifierEffect: vi.fn(),
  };
});

import { list } from "../identifiers";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("identifiers procedures", () => {
  it("lists identifiers for an entity", async () => {
    listIdentifiersForEntityEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000050",
          entityId: "00000000-0000-4000-8000-000000000010",
          type: "email",
          platform: "generic",
          value: "alice@example.com",
          confidence: "unverified",
          status: "current",
          notes: null,
          evidenceIds: [],
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
