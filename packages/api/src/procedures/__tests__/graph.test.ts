import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { writeGraphFromAgentEffect } = vi.hoisted(() => ({
  writeGraphFromAgentEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    writeGraphFromAgentEffect,
  };
});

import { write } from "../graph";

const actor = { userId: "u1", email: "a@test.local", name: "Agent" };

describe("graph procedures", () => {
  it("writes graph patches from authenticated callers", async () => {
    writeGraphFromAgentEffect.mockReturnValueOnce(
      Effect.succeed({
        writeId: "00000000-0000-4000-8000-000000000099",
        confidence: "unverified",
        opCount: 1,
        replayed: false,
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
