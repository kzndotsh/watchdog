import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const {
  listIdentifiersEffect,
  getIdentifiersByIdsEffect,
  deleteIdentifierEffect,
} = vi.hoisted(() => ({
  listIdentifiersEffect: vi.fn(),
  getIdentifiersByIdsEffect: vi.fn(),
  deleteIdentifierEffect: vi.fn(),
}));

vi.mock("@watchdog/core/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/graph")>();
  return {
    ...actual,
    listIdentifiersEffect,
    getIdentifiersByIdsEffect,
    createIdentifierEffect: vi.fn(),
    updateIdentifierEffect: vi.fn(),
    deleteIdentifierEffect,
  };
});

import { testActor } from "@watchdog/schemas/testing";

import { create, getMany, list, remove, update } from "../identifiers";

const actor = testActor();
const caseId = "00000000-0000-4000-8000-000000000001";
const identifierId = "00000000-0000-4000-8000-000000000050";

describe("identifiers procedures", () => {
  const entityId = "00000000-0000-4000-8000-000000000010";
  const record = {
    id: identifierId,
    entityId,
    type: "email",
    platform: "generic",
    value: "alice@example.com",
    confidence: "unverified",
    status: "current",
    notes: null,
    evidenceIds: [],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    entityName: "Alice",
    entitySlug: "alice",
    entityKind: "person",
  } as const;

  const sessionClient = () =>
    createRouterClient(
      { list, getMany },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

  it("lists one Entity's identifiers as the Case list with entityId set", async () => {
    listIdentifiersEffect.mockReturnValueOnce(
      Effect.succeed({
        items: [record],
        nextCursor: null,
        total: { count: 1, isCapped: false },
      })
    );

    const page = await sessionClient().list({
      caseId,
      entityId,
      type: ["email"],
      sort: "created.desc",
    });

    expect(page.items).toHaveLength(1);
    expect(listIdentifiersEffect).toHaveBeenCalledWith(
      caseId,
      actor.organizationId,
      expect.objectContaining({
        caseId,
        entityId,
        type: ["email"],
        sort: "created.desc",
      })
    );
  });

  it("refuses a two-character search before core runs", async () => {
    listIdentifiersEffect.mockClear();
    await expect(
      sessionClient().list({ caseId, q: "al" })
    ).rejects.toMatchObject({ message: "Input validation failed" });
    expect(listIdentifiersEffect).not.toHaveBeenCalled();
  });

  it("gets identifiers by id", async () => {
    getIdentifiersByIdsEffect.mockReturnValueOnce(Effect.succeed([record]));
    await expect(
      sessionClient().getMany({ caseId, ids: [identifierId] })
    ).resolves.toEqual([record]);
    expect(getIdentifiersByIdsEffect).toHaveBeenCalledWith(
      caseId,
      actor.organizationId,
      [identifierId]
    );
  });

  it("deletes an identifier", async () => {
    deleteIdentifierEffect.mockReturnValueOnce(Effect.void);

    const client = createRouterClient(
      { remove },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(client.remove({ caseId, identifierId })).resolves.toEqual({
      ok: true,
    });
    expect(deleteIdentifierEffect).toHaveBeenCalledWith(
      caseId,
      actor.organizationId,
      identifierId,
      expect.objectContaining({ actorId: actor.userId })
    );
  });

  it("rejects whitespace-only identifier values on create", async () => {
    const client = createRouterClient(
      { create },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.create({
        caseId,
        entityId: "00000000-0000-4000-8000-000000000010",
        type: "email",
        value: "   ",
        confidence: "unverified",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("rejects handle identifiers without a platform on create", async () => {
    const client = createRouterClient(
      { create },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.create({
        caseId,
        entityId: "00000000-0000-4000-8000-000000000010",
        type: "handle",
        value: "alice",
        confidence: "unverified",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("rejects an empty identifier update body", async () => {
    const client = createRouterClient(
      { update },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.update({
        expectedVersion: 1,
        caseId,
        identifierId,
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "At least one field is required" }],
      },
    });
  });
});
