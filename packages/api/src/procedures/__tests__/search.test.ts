import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { searchCaseEffect } = vi.hoisted(() => ({
  searchCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    searchCaseEffect,
  };
});

import { searchCaseProc } from "../search";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("search procedures", () => {
  it("searches within a case", async () => {
    searchCaseEffect.mockReturnValueOnce(
      Effect.succeed({
        q: "alice",
        entities: [],
        identifiers: [],
        evidence: [],
        tasks: [],
        jobs: [],
        proposals: [],
        cases: [],
      })
    );

    const client = createRouterClient(
      { searchCase: searchCaseProc },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.searchCase({
        caseId: "00000000-0000-4000-8000-000000000001",
        q: "alice",
      })
    ).resolves.toMatchObject({ q: "alice" });
  });
});
