import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listCapabilitiesEffect, listPlaybookDescriptorsEffect } = vi.hoisted(
  () => ({
    listCapabilitiesEffect: vi.fn(),
    listPlaybookDescriptorsEffect: vi.fn(),
  })
);

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listCapabilitiesEffect,
    listPlaybookDescriptorsEffect,
  };
});

import { list, listPlaybooksProc } from "../capabilities";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("capabilities procedures", () => {
  it("lists capabilities and playbooks", async () => {
    listCapabilitiesEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "network.dns.lookup",
          version: "1",
          title: "DNS Lookup",
          egress: "third_party",
          input: {},
          inputForm: {},
        },
      ])
    );
    listPlaybookDescriptorsEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "seed-dns",
          title: "Seed DNS",
          description: "Lookup host",
          seedKinds: ["host"],
          steps: ["network.dns.lookup"],
          requires: { credentials: [], egress: "third_party", flags: [] },
        },
      ])
    );

    const client = createRouterClient(
      { list, listPlaybooks: listPlaybooksProc },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.list()).resolves.toHaveLength(1);
    await expect(client.listPlaybooks()).resolves.toHaveLength(1);
  });
});
