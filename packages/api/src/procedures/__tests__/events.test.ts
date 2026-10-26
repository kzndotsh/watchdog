import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listEventsEffect, updateEventEffect } = vi.hoisted(() => ({
  listEventsEffect: vi.fn(),
  updateEventEffect: vi.fn(),
}));

vi.mock("@watchdog/core/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/graph")>();
  return {
    ...actual,
    listEventsEffect,
    createEventEffect: vi.fn(),
    updateEventEffect,
    deleteEventEffect: vi.fn(),
  };
});

import { testActor } from "@watchdog/schemas/testing";

import { create, list, update } from "../events";

const actor = testActor();

describe("events procedures", () => {
  it("lists the Case's events, one Entity's through entityId", async () => {
    listEventsEffect.mockReturnValueOnce(
      Effect.succeed({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000030",
            entityId: "00000000-0000-4000-8000-000000000010",
            when: "2026-01-01T12:00:00.000Z",
            what: "Seen online",
            where: null,
            version: 1,
          },
        ],
        nextCursor: null,
        total: { count: 1, isCapped: false },
      })
    );

    const client = createRouterClient(
      { list },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.list({
        caseId: "00000000-0000-4000-8000-000000000001",
        entityId: "00000000-0000-4000-8000-000000000010",
      })
    ).resolves.toHaveProperty("items.length", 1);
    expect(listEventsEffect).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      actor.organizationId,
      expect.objectContaining({
        entityId: "00000000-0000-4000-8000-000000000010",
      })
    );
  });

  it("rejects whitespace-only event fields on create", async () => {
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
        caseId: "00000000-0000-4000-8000-000000000001",
        entityId: "00000000-0000-4000-8000-000000000010",
        when: "   ",
        what: "Met at cafe",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("rejects an empty event update body", async () => {
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
        caseId: "00000000-0000-4000-8000-000000000001",
        eventId: "00000000-0000-4000-8000-000000000030",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "At least one field is required" }],
      },
    });
  });

  it("allows where-only null updates to clear the location", async () => {
    updateEventEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000030",
        entityId: "00000000-0000-4000-8000-000000000010",
        when: "2026-01-01T12:00:00.000Z",
        what: "Seen online",
        where: null,
        version: 1,
      })
    );

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
        caseId: "00000000-0000-4000-8000-000000000001",
        eventId: "00000000-0000-4000-8000-000000000030",
        where: null,
        userOverride: true,
      })
    ).resolves.toMatchObject({ where: null });
  });
});
