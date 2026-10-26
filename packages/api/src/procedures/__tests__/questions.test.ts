import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listQuestionsEffect, updateQuestionEffect, deleteQuestionEffect } =
  vi.hoisted(() => ({
    listQuestionsEffect: vi.fn(),
    updateQuestionEffect: vi.fn(),
    deleteQuestionEffect: vi.fn(),
  }));

vi.mock("@watchdog/core/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/graph")>();
  return {
    ...actual,
    listQuestionsEffect,
    createQuestionEffect: vi.fn(),
    updateQuestionEffect,
    resolveQuestionEffect: vi.fn(),
    reopenQuestionEffect: vi.fn(),
    deleteQuestionEffect,
  };
});

import { testActor } from "@watchdog/schemas/testing";

import { create, list, remove, update } from "../questions";

const actor = testActor();

describe("questions procedures", () => {
  it("lists the Case's questions, one Entity's through entityId", async () => {
    listQuestionsEffect.mockReturnValueOnce(
      Effect.succeed({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000080",
            entityId: "00000000-0000-4000-8000-000000000010",
            text: "Same person?",
            status: "open",
            resolvedNote: null,
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
    expect(listQuestionsEffect).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      actor.organizationId,
      expect.objectContaining({
        entityId: "00000000-0000-4000-8000-000000000010",
      })
    );
  });

  it("rejects whitespace-only question text on create", async () => {
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
        text: "   ",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("rejects an empty question update body", async () => {
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
        questionId: "00000000-0000-4000-8000-000000000080",
        userOverride: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "At least one field is required" }],
      },
    });
  });

  it("allows resolvedNote-only null updates to clear the note", async () => {
    updateQuestionEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000080",
        entityId: "00000000-0000-4000-8000-000000000010",
        text: "Same person?",
        status: "resolved",
        resolvedNote: null,
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
        questionId: "00000000-0000-4000-8000-000000000080",
        resolvedNote: null,
        userOverride: true,
      })
    ).resolves.toBeDefined();
  });

  it("deletes a question", async () => {
    deleteQuestionEffect.mockReturnValueOnce(Effect.void);

    const client = createRouterClient(
      { delete: remove },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.delete({
        caseId: "00000000-0000-4000-8000-000000000001",
        questionId: "00000000-0000-4000-8000-000000000080",
        userOverride: true,
      })
    ).resolves.toEqual({ ok: true });
  });
});
