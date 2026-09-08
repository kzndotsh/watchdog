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

import { list, create, update } from "../edges";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

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

  it("rejects an empty edge update body", async () => {
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
      client.update({
        caseId: "00000000-0000-4000-8000-000000000001",
        edgeId: "00000000-0000-4000-8000-000000000020",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "At least one field is required" }],
      },
    });
  });

  it("rejects self-linked edge create", async () => {
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

    const entityId = "00000000-0000-4000-8000-000000000010";
    await expect(
      client.create({
        caseId: "00000000-0000-4000-8000-000000000001",
        fromId: entityId,
        toId: entityId,
        predicate: "same_as",
        confidence: "unverified",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "fromId and toId must differ" }],
      },
    });
  });

  it("rejects related_to create without notes", async () => {
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
        caseId: "00000000-0000-4000-8000-000000000001",
        fromId: "00000000-0000-4000-8000-000000000010",
        toId: "00000000-0000-4000-8000-000000000011",
        predicate: "related_to",
        confidence: "unverified",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "related_to requires notes" }],
      },
    });
  });

  it("accepts predicate-only related_to update at ingress", async () => {
    const { updateEdgeEffect } = await import("@watchdog/core");
    vi.mocked(updateEdgeEffect).mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000020",
        fromId: "00000000-0000-4000-8000-000000000010",
        toId: "00000000-0000-4000-8000-000000000011",
        predicate: "related_to",
        confidence: "unverified",
        notes: "existing link",
        evidenceIds: [],
        peerId: "00000000-0000-4000-8000-000000000011",
        peerName: "Bob",
        peerSlug: "bob",
        peerKind: "person",
        direction: "out",
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
      client.update({
        caseId: "00000000-0000-4000-8000-000000000001",
        edgeId: "00000000-0000-4000-8000-000000000020",
        predicate: "related_to",
        userOverride: true,
      })
    ).resolves.toMatchObject({ predicate: "related_to" });
    expect(updateEdgeEffect).toHaveBeenCalledWith({
      caseId: "00000000-0000-4000-8000-000000000001",
      edgeId: "00000000-0000-4000-8000-000000000020",
      predicate: "related_to",
      organizationId: actor.organizationId,
    });
  });

  it("rejects related_to update with explicit empty notes", async () => {
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
      client.update({
        caseId: "00000000-0000-4000-8000-000000000001",
        edgeId: "00000000-0000-4000-8000-000000000020",
        predicate: "related_to",
        notes: null,
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "related_to requires notes" }],
      },
    });
  });

  it("rejects self-linked edge update", async () => {
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

    const entityId = "00000000-0000-4000-8000-000000000010";
    await expect(
      client.update({
        caseId: "00000000-0000-4000-8000-000000000001",
        edgeId: "00000000-0000-4000-8000-000000000020",
        fromId: entityId,
        toId: entityId,
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "fromId and toId must differ" }],
      },
    });
  });

  it("rejects viewEntityId-only edge updates", async () => {
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
      client.update({
        caseId: "00000000-0000-4000-8000-000000000001",
        edgeId: "00000000-0000-4000-8000-000000000020",
        viewEntityId: "00000000-0000-4000-8000-000000000010",
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
