import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listRecentActivityEffect } = vi.hoisted(() => ({
  listRecentActivityEffect: vi.fn(),
}));

vi.mock("@watchdog/core/activity", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@watchdog/core/activity")>();
  return {
    ...actual,
    listRecentActivityEffect,
  };
});

import { TEST_ORGANIZATION_ID, testActor } from "@watchdog/schemas/testing";

import { listRecent } from "../activity";

const actor = testActor();

describe("activity procedures", () => {
  it("lists recent activity for the authenticated actor", async () => {
    listRecentActivityEffect.mockReturnValueOnce(
      Effect.succeed({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000010",
            kind: "job",
            action: "succeeded",
            caseId: "00000000-0000-4000-8000-000000000001",
            caseName: "Alpha",
            label: "DNS lookup",
            at: "2026-01-01T12:00:00.000Z",
          },
        ],
        nextCursor: null,
      })
    );

    const client = createRouterClient(
      { listRecent },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(client.listRecent({ limit: 5 })).resolves.toHaveProperty(
      "items.length",
      1
    );
    expect(listRecentActivityEffect).toHaveBeenCalledWith({
      organizationId: TEST_ORGANIZATION_ID,
      caseId: undefined,
      limit: 5,
    });
  });
});
