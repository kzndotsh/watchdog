import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listEntitiesForCaseEffect, deleteEntityEffect } = vi.hoisted(() => ({
  listEntitiesForCaseEffect: vi.fn(),
  deleteEntityEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listEntitiesForCaseEffect,
    getEntityByCaseSlugEffect: vi.fn(),
    createEntityEffect: vi.fn(),
    updateEntityFieldsEffect: vi.fn(),
    deleteEntityEffect,
  };
});

import { list, remove } from "../entities";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};
const caseId = "00000000-0000-4000-8000-000000000001";
const entityId = "00000000-0000-4000-8000-000000000010";

describe("entities procedures", () => {
  it("lists entities for a case", async () => {
    listEntitiesForCaseEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: entityId,
          caseId,
          kind: "person",
          name: "Alice",
          slug: "alice",
          summary: null,
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
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

    await expect(client.list({ caseId })).resolves.toHaveLength(1);
  });

  it("deletes an entity", async () => {
    deleteEntityEffect.mockReturnValueOnce(Effect.void);

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

    await expect(client.remove({ caseId, entityId })).resolves.toEqual({
      ok: true,
    });
    expect(deleteEntityEffect).toHaveBeenCalledWith(
      caseId,
      actor.organizationId,
      entityId
    );
  });
});
