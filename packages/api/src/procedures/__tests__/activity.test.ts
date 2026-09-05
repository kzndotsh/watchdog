import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listRecentActivityEffect } = vi.hoisted(() => ({
  listRecentActivityEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listRecentActivityEffect,
  };
});

import { listRecent } from "../activity";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("activity procedures", () => {
  it("lists recent activity for the authenticated actor", async () => {
    listRecentActivityEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000010",
          kind: "job",
          action: "succeeded",
          caseId: "00000000-0000-4000-8000-000000000001",
          caseName: "Alpha",
          label: "DNS lookup",
          at: "2026-01-01T12:00:00.000Z",
        },
      ])
    );

    const client = createRouterClient(
      { listRecent },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.listRecent({ limit: 5 })).resolves.toHaveLength(1);
    expect(listRecentActivityEffect).toHaveBeenCalledWith({
      organizationId: "org-test",
      caseId: undefined,
      limit: 5,
    });
  });
});
