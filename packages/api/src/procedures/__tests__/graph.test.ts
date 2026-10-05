import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { writeGraphFromAgentEffect } = vi.hoisted(() => ({
  writeGraphFromAgentEffect: vi.fn(),
}));

vi.mock("@watchdog/core/proposals", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@watchdog/core/proposals")>();
  return {
    ...actual,
    writeGraphFromAgentEffect,
  };
});

import { testActor } from "@watchdog/test-kit";

import { write } from "../graph";

const actor = testActor();

describe("graph procedures", () => {
  it("writes graph patches from authenticated callers", async () => {
    writeGraphFromAgentEffect.mockReturnValueOnce(
      Effect.succeed({
        writeId: "00000000-0000-4000-8000-000000000099",
        confidence: "unverified",
        opCount: 1,
        replayed: false,
        actorLabel: "u1",
      })
    );

    const client = createRouterClient(
      { write },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.write({
        caseId: "00000000-0000-4000-8000-000000000001",
        patch: [
          {
            op: "create",
            resource: "entity",
            id: "00000000-0000-4000-8000-000000000010",
            data: { kind: "person", name: "Alice", slug: "alice" },
          },
        ],
        userOverride: true,
      })
    ).resolves.toMatchObject({ opCount: 1 });
  });
});
