import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const {
  listEntitiesForCaseEffect,
  deleteEntityEffect,
  createEntityEffect,
  updateEntityFieldsEffect,
} = vi.hoisted(() => ({
  listEntitiesForCaseEffect: vi.fn(),
  deleteEntityEffect: vi.fn(),
  createEntityEffect: vi.fn(),
  updateEntityFieldsEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listEntitiesForCaseEffect,
    getEntityByCaseSlugEffect: vi.fn(),
    createEntityEffect,
    updateEntityFieldsEffect,
    deleteEntityEffect,
  };
});

import { create, get, list, remove, update } from "../entities";

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

  it("rejects invalid entity slugs on get", async () => {
    const client = createRouterClient(
      { get },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.get({ caseId, slug: "!!!" })).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("rejects whitespace-only entity names on create", async () => {
    const client = createRouterClient(
      { create },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.create({
        caseId,
        kind: "person",
        name: "   ",
        slug: "alpha",
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("normalizes entity slugs on create", async () => {
    createEntityEffect.mockReturnValueOnce(
      Effect.succeed({
        id: entityId,
        caseId,
        kind: "org",
        name: "Alpha Corp",
        slug: "alpha-corp",
        summary: null,
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    );

    const client = createRouterClient(
      { create },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await client.create({
      caseId,
      kind: "org",
      name: "Alpha Corp",
      slug: "Alpha Corp",
    });

    expect(createEntityEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "alpha-corp",
        organizationId: actor.organizationId,
      })
    );
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

  it("rejects an empty entity update body", async () => {
    const client = createRouterClient(
      { update },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.update({ caseId, entityId })).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "At least one field is required" }],
      },
    });
  });

  it("allows summary-only null updates to clear the summary", async () => {
    updateEntityFieldsEffect.mockReturnValueOnce(
      Effect.succeed({
        id: entityId,
        caseId,
        kind: "person",
        name: "Alice",
        slug: "alice",
        summary: null,
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    );

    const client = createRouterClient(
      { update },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.update({ caseId, entityId, summary: null })
    ).resolves.toMatchObject({ summary: null });
  });
});
