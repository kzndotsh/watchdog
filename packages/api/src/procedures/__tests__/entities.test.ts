import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listEntitiesForCaseEffect } = vi.hoisted(() => ({
  listEntitiesForCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listEntitiesForCaseEffect,
    getEntityByCaseSlugEffect: vi.fn(),
    createEntityEffect: vi.fn(),
    updateEntityFieldsEffect: vi.fn(),
  };
});

import { list } from "../entities";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};
const caseId = "00000000-0000-4000-8000-000000000001";

describe("entities procedures", () => {
  it("lists entities for a case", async () => {
    listEntitiesForCaseEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000010",
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
});
