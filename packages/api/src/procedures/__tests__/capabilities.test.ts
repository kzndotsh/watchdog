import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listCapabilitiesEffect, listPlaybookDescriptorsEffect } = vi.hoisted(
  () => ({
    listCapabilitiesEffect: vi.fn(),
    listPlaybookDescriptorsEffect: vi.fn(),
  })
);

vi.mock("@watchdog/core/caps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/caps")>();
  return {
    ...actual,
    listCapabilitiesEffect,
    listPlaybookDescriptorsEffect,
  };
});

import { testActor } from "@watchdog/schemas/testing";

import { list, listPlaybooksProc } from "../capabilities";

const actor = testActor();

describe("capabilities procedures", () => {
  it("lists capabilities and playbooks", async () => {
    listCapabilitiesEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "network.dns.lookup",
          version: "1",
          title: "DNS Lookup",
          provider: {
            name: "Example",
            url: "https://example.com",
            termsUrl: "https://example.com/terms",
            tier: "freemium",
            commercialUse: "restricted",
            attribution: {
              text: "Data from Example",
              url: "https://example.com",
            },
          },
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
          credential: { kind: "session" },
        },
      }
    );

    const caps = await client.list();
    expect(caps).toHaveLength(1);
    expect(caps[0]?.provider.attribution).toEqual({
      text: "Data from Example",
      url: "https://example.com",
    });
    await expect(client.listPlaybooks()).resolves.toHaveLength(1);
  });
});
