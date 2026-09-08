import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listQuestionsForEntityEffect, updateQuestionEffect } = vi.hoisted(
  () => ({
    listQuestionsForEntityEffect: vi.fn(),
    updateQuestionEffect: vi.fn(),
  })
);

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listQuestionsForEntityEffect,
    createQuestionEffect: vi.fn(),
    updateQuestionEffect,
    resolveQuestionEffect: vi.fn(),
    reopenQuestionEffect: vi.fn(),
  };
});

import { create, list, update } from "../questions";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("questions procedures", () => {
  it("lists questions for an entity", async () => {
    listQuestionsForEntityEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000080",
          entityId: "00000000-0000-4000-8000-000000000010",
          text: "Same person?",
          status: "open",
          resolvedNote: null,
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

  it("rejects whitespace-only question text on create", async () => {
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
          authMethod: "session",
        },
      }
    );

    await expect(
      client.update({
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
        questionId: "00000000-0000-4000-8000-000000000080",
        resolvedNote: null,
        userOverride: true,
      })
    ).resolves.toBeDefined();
  });
});
