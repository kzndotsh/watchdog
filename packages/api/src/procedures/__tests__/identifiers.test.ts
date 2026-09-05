import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listIdentifiersForEntityEffect, deleteIdentifierEffect } = vi.hoisted(
  () => ({
    listIdentifiersForEntityEffect: vi.fn(),
    deleteIdentifierEffect: vi.fn(),
  })
);

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listIdentifiersForEntityEffect,
    listIdentifiersForCaseEffect: vi.fn(),
    createIdentifierEffect: vi.fn(),
    updateIdentifierEffect: vi.fn(),
    deleteIdentifierEffect,
  };
});

import { list, remove } from "../identifiers";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};
const caseId = "00000000-0000-4000-8000-000000000001";
const identifierId = "00000000-0000-4000-8000-000000000050";

describe("identifiers procedures", () => {
  it("lists identifiers for an entity", async () => {
    listIdentifiersForEntityEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: identifierId,
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
        caseId,
        entityId: "00000000-0000-4000-8000-000000000010",
      })
    ).resolves.toHaveLength(1);
  });

  it("deletes an identifier", async () => {
    deleteIdentifierEffect.mockReturnValueOnce(Effect.void);

    const client = createRouterClient(
      { remove },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.remove({ caseId, identifierId })).resolves.toEqual({
      ok: true,
    });
    expect(deleteIdentifierEffect).toHaveBeenCalledWith(
      caseId,
      actor.organizationId,
      identifierId
    );
  });
});
